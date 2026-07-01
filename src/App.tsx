import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { MountProfile } from './lib/types';
import { SetupWizard } from './components/wizard/SetupWizard';
import { ProfileSelector } from './components/ProfileSelector';
import { Dashboard } from './components/dashboard/Dashboard';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { ToastContainer } from './components/ui/ToastContainer';
import { Loader2 } from 'lucide-react';

type AppView = 'loading' | 'wizard' | 'profiles' | 'dashboard';

function AppContent() {
  const [view, setView] = useState<AppView>('loading');
  const [profiles, setProfiles] = useState<MountProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<MountProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState<MountProfile | null>(null);
  const { addToast } = useToast();

  // Updater States
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'ready' | 'downloading' | 'installing'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [contentLength, setContentLength] = useState<number>(0);

  const loadProfiles = useCallback(async () => {
    try {
      const result = await invoke<MountProfile[]>('list_profiles');
      setProfiles(result);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addToast('error', `Failed to load profiles: ${msg}`);
      console.error('Failed to load profiles:', e);
      return [];
    }
  }, [addToast]);

  // Initial load & Boot Update check
  useEffect(() => {
    (async () => {
      const result = await loadProfiles();
      setView(result.length > 0 ? 'profiles' : 'wizard');

      try {
        const update = await check();
        if (update) {
          setUpdateInfo(update);
          setUpdateStatus('ready');
          addToast('info', `StrataFuse v${update.version} is available! Click the update badge below to install.`);
        }
      } catch (err) {
        console.error('Failed to run boot update check:', err);
      }
    })();
  }, [loadProfiles, addToast]);

  const handleManualUpdateCheck = async () => {
    if (updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing') return;
    
    try {
      setUpdateStatus('checking');
      addToast('info', 'Checking for updates...');
      const update = await check();
      if (update) {
        setUpdateInfo(update);
        setUpdateStatus('ready');
        addToast('info', `StrataFuse v${update.version} is available!`);
      } else {
        setUpdateStatus('idle');
        addToast('success', 'StrataFuse is up to date!');
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setUpdateStatus('idle');
      addToast('error', 'Failed to check for updates. Please try again later.');
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    
    try {
      setUpdateStatus('downloading');
      setDownloadProgress(0);
      setContentLength(0);
      
      let downloaded = 0;
      await updateInfo.download((event: any) => {
        switch (event.event) {
          case 'Started':
            if (event.data && event.data.contentLength) {
              setContentLength(event.data.contentLength);
            }
            break;
          case 'Progress':
            if (event.data && event.data.chunkLength) {
              downloaded += event.data.chunkLength;
              setDownloadProgress(downloaded);
            }
            break;
          case 'Finished':
            break;
        }
      });
      
      setUpdateStatus('installing');
      addToast('info', 'Installing update and restarting...');
      await updateInfo.install();
      await relaunch();
    } catch (err) {
      console.error('Failed to download and install update:', err);
      setUpdateStatus('ready');
      addToast('error', 'Update installation failed. Please check your network connection.');
    }
  };

  const handleWizardComplete = async () => {
    setEditingProfile(null);
    await loadProfiles();
    setView('profiles');
  };

  const handleWizardCancel = () => {
    setEditingProfile(null);
    setView(profiles.length > 0 ? 'profiles' : 'wizard');
  };

  const handleMount = (profile: MountProfile) => {
    setActiveProfile(profile);
    setView('dashboard');
  };

  const handleDisconnect = async () => {
    setActiveProfile(null);
    await loadProfiles();
    setView('profiles');
  };

  const handleCreateNew = () => {
    setEditingProfile(null);
    setView('wizard');
  };

  const handleEdit = (profile: MountProfile) => {
    setEditingProfile(profile);
    setView('wizard');
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Gradient Orbs for glassmorphism depth */}
      <div className="gradient-orb gradient-orb-1" />
      <div className="gradient-orb gradient-orb-2" />
      <div className="gradient-orb gradient-orb-3" />

      <ToastContainer />

      {/* Loading */}
      {view === 'loading' && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin-slow" />
            <p className="text-white/40 text-sm">Loading StrataFuse...</p>
          </div>
        </div>
      )}

      {/* Wizard */}
      {view === 'wizard' && (
        <SetupWizard
          onComplete={handleWizardComplete}
          onCancel={profiles.length > 0 ? handleWizardCancel : undefined}
          editingProfile={editingProfile}
        />
      )}

      {/* Profile Selector */}
      {view === 'profiles' && (
        <ProfileSelector
          profiles={profiles}
          onMount={handleMount}
          onCreateNew={handleCreateNew}
          onEdit={handleEdit}
          onRefresh={() => loadProfiles()}
        />
      )}

      {/* Dashboard */}
      {view === 'dashboard' && activeProfile && (
        <Dashboard
          profileName={activeProfile.name}
          profileId={activeProfile.id}
          mountPoint={activeProfile.mountPoint}
          onDisconnect={handleDisconnect}
          onBackToList={() => setView('profiles')}
        />
      )}

      {/* Footer Credits */}
      {view !== 'dashboard' && view !== 'loading' && (
        <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-[10px] text-white/20 select-none z-30 font-mono">
          <div className="flex items-center gap-3 animate-fade-in">
            <span>StrataFuse v0.2.0</span>
            {updateStatus === 'checking' && (
              <span className="flex items-center gap-1 text-violet-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Checking...
              </span>
            )}
            {updateStatus === 'ready' && updateInfo && (
              <button
                onClick={handleInstallUpdate}
                className="bg-violet-600/45 hover:bg-violet-600/65 text-violet-200 border border-violet-500/25 px-2 py-0.5 rounded transition-all cursor-pointer font-semibold shadow-[0_0_10px_rgba(124,58,237,0.15)] animate-pulse"
              >
                ✨ Install v{updateInfo.version}
              </button>
            )}
            {updateStatus === 'downloading' && (
              <span className="text-cyan-400 font-semibold animate-pulse">
                📥 Downloading... {contentLength > 0 ? `${Math.round((downloadProgress / contentLength) * 100)}%` : `${(downloadProgress / 1024 / 1024).toFixed(1)}MB`}
              </span>
            )}
            {updateStatus === 'installing' && (
              <span className="text-emerald-400 font-semibold animate-pulse">
                ⚙️ Installing...
              </span>
            )}
            {updateStatus === 'idle' && (
              <button
                onClick={handleManualUpdateCheck}
                className="hover:text-white/40 cursor-pointer transition-colors"
                title="Click to check for updates"
              >
                (Check for Updates)
              </button>
            )}
          </div>
          <div>
            Developed by Aanish Farrukh (
            <a
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await openUrl('https://github.com/sudoaanish');
                } catch (err) {
                  console.error('Failed to open link:', err);
                }
              }}
              className="hover:text-violet-400 transition-colors cursor-pointer underline decoration-white/10 hover:decoration-violet-400/30 font-semibold"
            >
              sudoaanish
            </a>
            )
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
