import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../contexts/ToastContext';
import type { VfsStats } from '../../lib/types';
import { formatBytes } from '../../lib/format';
import { HardDrive, AlertTriangle, Trash2, Loader2 } from 'lucide-react';

interface Props {
  vfsStats: VfsStats | null;
  profileId: string;
}

export function CachePanel({ vfsStats, profileId }: Props) {
  const disk = vfsStats?.diskCache;
  const maxSize = vfsStats?.opt?.CacheMaxSize ?? 0;
  const used = disk?.bytesUsed ?? 0;
  const pct = maxSize > 0 ? Math.min((used / maxSize) * 100, 100) : 0;
  const { addToast } = useToast();
  const [isPurging, setIsPurging] = useState(false);

  const handlePurge = async () => {
    try {
      setIsPurging(true);
      await invoke('purge_profile_cache', { profileId });
      addToast('success', 'Local VFS Cache purged successfully.');
    } catch (err) {
      addToast('error', `Failed to purge cache: ${err}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white/70">VFS Cache</h3>
        </div>
        <div className="flex items-center gap-3">
          {vfsStats?.outOfSpace && (
            <div className="flex items-center gap-1 text-red-400 text-xs">
              <AlertTriangle className="w-3 h-3" /> Out of space
            </div>
          )}
          <button
            onClick={handlePurge}
            disabled={isPurging}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold text-red-400/80 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            title="Purge VFS cache from disk"
          >
            {isPurging ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Purge Cache
          </button>
        </div>
      </div>

      {/* Usage bar */}
      <div className="mb-3">
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full progress-bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-white/40">
          <span>{formatBytes(used)} used</span>
          <span>{maxSize > 0 ? formatBytes(maxSize) : '—'} max</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="bg-white/[0.02] rounded-lg p-2.5">
          <p className="text-xs text-white/30">Files in cache</p>
          <p className="text-sm font-medium text-white/80">{vfsStats?.inUse ?? 0}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2.5">
          <p className="text-xs text-white/30">Uploading</p>
          <p className="text-sm font-medium text-white/80">{disk?.uploadsInProgress ?? 0}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2.5">
          <p className="text-xs text-white/30">Queued</p>
          <p className="text-sm font-medium text-white/80">{disk?.uploadsQueued ?? 0}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2.5">
          <p className="text-xs text-white/30">Errors</p>
          <p className="text-sm font-medium text-white/80">{disk?.erroredFiles ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
