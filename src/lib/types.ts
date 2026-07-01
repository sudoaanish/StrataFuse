/* ── Daemon ───────────────────────────────────────────────────────────────── */

export type DaemonStatusTag = 'idle' | 'starting' | 'running' | 'stopping';

export type DaemonStatus =
  | { status: DaemonStatusTag }
  | { status: 'crashed'; message: string };

export interface DaemonState {
  status: DaemonStatus;
  pid: number | null;
  startedAt: string | null;
  startedByApp: boolean;
}

/* ── Mount Profiles ──────────────────────────────────────────────────────── */

export interface MountProfile {
  id: string;
  name: string;
  provider: string;
  remote: string;
  mountPoint: string;
  useCrypt: boolean;
  cryptRemote: string | null;
  tuningProfile: string;
  vfsCacheMode: string;
  vfsCacheMaxSize: string;
  networkMode: boolean;
  rcAddr: string;
  rcUser: string;
  rcPass: string;
  createdAt: string;
  lastUsed: string | null;
  credentials?: Record<string, string>;
  autoMount: boolean;
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

export interface TransferItem {
  name: string;
  size: number;
  bytes: number;
  speed: number;
  percentage: number;
  eta: number;
  group: string;
}

export interface CoreStats {
  bytes: number;
  checks: number;
  deletedDirs: number;
  deletes: number;
  elapsedTime: number;
  errors: number;
  eta: number | null;
  fatalError: boolean;
  lastError: string;
  renames: number;
  retryError: boolean;
  speed: number;
  totalBytes: number;
  totalChecks: number;
  totalTransfers: number;
  transferTime: number;
  transfers: number;
  transferring?: TransferItem[];
}

export interface VfsStats {
  diskCache: {
    bytesUsed: number;
    erroredFiles: number;
    uploadsInProgress: number;
    uploadsQueued: number;
  };
  inUse: number;
  metadataCache: {
    dirs: number;
    files: number;
  };
  opt: {
    CacheMaxSize: number;
    CacheMode: number;
    DirCacheTime: number;
  };
  outOfSpace: boolean;
}

export interface CompletedTransferItem {
  name: string;
  size: number;
  error?: string;
  checked?: boolean;
}

export interface AggregatedStats {
  mountStatus: string;
  coreStats: CoreStats | null;
  vfsStats: VfsStats | null;
  recentTransfers?: { transferred?: CompletedTransferItem[] } | null;
}

/* ── Logs ─────────────────────────────────────────────────────────────────── */

export interface LogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  line: string;
}

export interface LogQueryResponse {
  entries: LogEntry[];
  totalLines: number;
  bufferedCount: number;
}

/* ── Wizard ───────────────────────────────────────────────────────────────── */

export interface WizardData {
  provider: string;
  authConfig: Record<string, string>;
  mountEntireDrive: boolean;
  subDirectory: string;
  useCrypt: boolean;
  cryptPassword: string;
  cryptPassword2: string;
  mountPoint: string;
  tuningProfile: 'media' | 'general' | 'backup';
  profileName: string;
  autoMount: boolean;
}
