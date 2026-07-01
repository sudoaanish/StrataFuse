/**
 * Format a byte count into a human-readable string (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '—';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, units.length - 1);
  const value = bytes / Math.pow(k, idx);

  return `${value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : value.toFixed(0)} ${units[idx]}`;
}

/**
 * Format bytes-per-second into a human-readable speed string.
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) return '—';
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format a duration in seconds into a human-readable string (Xh Xm Xs).
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';

  const s = Math.floor(seconds);
  if (s === 0) return '0s';

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);

  return parts.join(' ');
}

/**
 * Truncate a name to a maximum length, adding ellipsis if needed.
 */
export function formatName(name: string, maxLen: number): string {
  if (!name) return '';
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}

/**
 * Format a relative timestamp (e.g. '2 hours ago').
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `${m} minute${m !== 1 ? 's' : ''} ago`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(diffSec / 86400);
  if (d < 30) return `${d} day${d !== 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}
