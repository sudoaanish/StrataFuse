import type { VfsStats } from '../../lib/types';
import { formatBytes } from '../../lib/format';
import { HardDrive, AlertTriangle } from 'lucide-react';

interface Props {
  vfsStats: VfsStats | null;
}

export function CachePanel({ vfsStats }: Props) {
  const disk = vfsStats?.diskCache;
  const maxSize = vfsStats?.opt?.CacheMaxSize ?? 0;
  const used = disk?.bytesUsed ?? 0;
  const pct = maxSize > 0 ? Math.min((used / maxSize) * 100, 100) : 0;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white/70">VFS Cache</h3>
        </div>
        {vfsStats?.outOfSpace && (
          <div className="flex items-center gap-1 text-red-400 text-xs">
            <AlertTriangle className="w-3 h-3" /> Out of space
          </div>
        )}
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
