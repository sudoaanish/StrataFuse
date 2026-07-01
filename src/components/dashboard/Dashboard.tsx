import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStats } from '../../hooks/useStats';
import { useLogs } from '../../hooks/useLogs';
import { useToast } from '../../contexts/ToastContext';
import { StatCard } from './StatCard';
import { TransferTable } from './TransferTable';
import { CachePanel } from './CachePanel';
import { LogViewer } from './LogViewer';
import { formatBytes, formatSpeed, formatDuration } from '../../lib/format';
import { Square, RefreshCw, Download, Upload, Activity, AlertTriangle, ArrowLeft, Folder } from 'lucide-react';

interface Props {
  profileName: string;
  profileId: string;
  mountPoint: string;
  onDisconnect: () => void;
  onBackToList: () => void;
}

export function Dashboard({ profileName, profileId, mountPoint, onDisconnect, onBackToList }: Props) {
  const { coreStats, vfsStats, daemonStatus, recentTransfers } = useStats({ enabled: true, interval: 2000, profileId });
  const { entries, totalLines } = useLogs({ enabled: true, interval: 3000, count: 200, profileId });
  const { addToast } = useToast();
  const [uptime, setUptime] = useState(0);
  const startTime = useRef(Date.now());
  
  // Uptime counter
  useEffect(() => {
    const id = setInterval(() => setUptime(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

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
      await invoke('stop_mount', { profileId });
      await new Promise(r => setTimeout(r, 500));
      await invoke('start_mount', { profileId });
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

  return (
    <div className="min-h-screen p-6 relative z-10 animate-fade-in">
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
          label="Download"
          value={formatSpeed(cs?.speed ?? 0)}
          accentColor="text-cyan-400"
        />
        <StatCard
          icon={Upload}
          label="Upload"
          value={cs ? 'N/A' : '—'}
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
          <CachePanel vfsStats={vfsStats ?? null} />
          <LogViewer logs={logData} />
        </div>
      </div>
    </div>
  );
}
