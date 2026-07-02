import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStats } from '../../hooks/useStats';
import { useLogs } from '../../hooks/useLogs';
import { useToast } from '../../contexts/ToastContext';
import { StatCard } from './StatCard';
import { TransferTable } from './TransferTable';
import { CachePanel } from './CachePanel';
import { LogViewer } from './LogViewer';
import { formatBytes, formatSpeed, formatDuration } from '../../lib/format';
import { Square, RefreshCw, Download, Activity, AlertTriangle, ArrowLeft, Folder, Cloud, Loader2 } from 'lucide-react';

interface Props {
  profileName: string;
  profileId: string;
  mountPoint: string;
  onDisconnect: () => void;
  onBackToList: () => void;
}

export function Dashboard({ profileName, profileId, mountPoint, onDisconnect, onBackToList }: Props) {
  const { coreStats, vfsStats, daemonStatus, recentTransfers, storageInfo, isLoading, error } = useStats({ enabled: true, interval: 2000, profileId });
  const { entries, totalLines } = useLogs({ enabled: true, interval: 3000, count: 200, profileId });
  const { addToast } = useToast();
  const [uptime, setUptime] = useState(0);
  
  // Uptime counter relative to startedAt
  useEffect(() => {
    const id = setInterval(() => {
      if (daemonStatus?.startedAt) {
        const start = new Date(daemonStatus.startedAt).getTime();
        setUptime(Math.floor((Date.now() - start) / 1000));
      } else {
        setUptime(0);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [daemonStatus?.startedAt]);

  const handleStop = async () => {
    try {
      await invoke('stop_mount', { profileId });
      onDisconnect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addToast('error', `Failed to stop mount: ${msg}`);
    }
  };

  const handleRestart = async () => {
    try {
      await invoke('restart_mount', { profileId });
      addToast('success', 'Mount restarted successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addToast('error', `Failed to restart mount: ${msg}`);
    }
  };

  const cs = coreStats;
  const isRunning = daemonStatus?.status?.status === 'running';

  // Build a LogQueryResponse-compatible object for LogViewer
  const logData = { entries, totalLines, bufferedCount: entries.length };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0c16]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-white/60 text-sm">Loading dashboard statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 relative z-10 animate-fade-in">
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs flex items-center gap-2 animate-fade-in z-40 relative">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span><b>Connection Warning:</b> {error} (Stats may be stale/offline)</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBackToList} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors z-30 relative" title="Back to Profiles">
            <ArrowLeft className="w-5 h-5 text-white/60" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-white">{profileName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-sm text-white/50">
                {isRunning ? 'Mounted' : 'Offline'} · {formatDuration(uptime)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                await invoke('open_in_explorer', { mountPoint });
              } catch (err) {
                addToast('error', `Failed to open Explorer: ${err}`);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all"
            title="Open in Windows Explorer"
          >
            <Folder className="w-4 h-4" /> Open Folder
          </button>
          <button
            onClick={handleRestart}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Restart
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all"
          >
            <Square className="w-4 h-4" /> Stop
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Download}
          label="Download Speed"
          value={formatSpeed(cs?.speed ?? 0)}
          accentColor="text-cyan-400"
        />
        <StatCard
          icon={Cloud}
          label="Cloud Storage"
          value={storageInfo && storageInfo.total > 0 ? `${formatBytes(storageInfo.used)} / ${formatBytes(storageInfo.total)}` : storageInfo ? 'No limit' : 'Loading...'}
          subValue={storageInfo && storageInfo.total > 0 ? `${Math.round((storageInfo.used / storageInfo.total) * 100)}% Used` : storageInfo ? 'Unlimited Space' : ''}
          accentColor="text-violet-400"
        />
        <StatCard
          icon={Activity}
          label="Transferred"
          value={formatBytes(cs?.bytes ?? 0)}
          subValue={`${cs?.transfers ?? 0} files`}
          accentColor="text-emerald-400"
        />
        <StatCard
          icon={AlertTriangle}
          label="Errors"
          value={String(cs?.errors ?? 0)}
          accentColor={cs?.errors ? 'text-red-400' : 'text-white/30'}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-5 gap-4" style={{ height: 'calc(100vh - 250px)' }}>
        {/* Left: Transfers */}
        <div className="col-span-3 flex flex-col gap-4 overflow-hidden min-h-0 h-full">
          <TransferTable transfers={cs?.transferring ?? []} completedTransfers={recentTransfers} />
        </div>

        {/* Right: Cache + Logs */}
        <div className="col-span-2 flex flex-col gap-4 overflow-hidden min-h-0 h-full">
          <CachePanel vfsStats={vfsStats ?? null} profileId={profileId} />
          <LogViewer logs={logData} />
        </div>
      </div>
    </div>
  );
}
