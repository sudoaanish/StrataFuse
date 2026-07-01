import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
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

  // Initial load
  useEffect(() => {
    (async () => {
      const result = await loadProfiles();
      setView(result.length > 0 ? 'profiles' : 'wizard');
    })();
  }, [loadProfiles]);

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
          <div>
            StrataFuse v0.1.0
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
