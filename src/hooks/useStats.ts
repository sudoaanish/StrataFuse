import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AggregatedStats, CoreStats, VfsStats, DaemonState, CompletedTransferItem } from '../lib/types';

interface UseStatsOptions {
  enabled?: boolean;
  interval?: number;
  profileId: string;
}

interface UseStatsReturn {
  coreStats: CoreStats | null;
  vfsStats: VfsStats | null;
  mountStatus: string | null;
  daemonStatus: DaemonState | null;
  recentTransfers: CompletedTransferItem[];
  isLoading: boolean;
  error: string | null;
}

export function useStats(options: UseStatsOptions): UseStatsReturn {
  const { enabled = true, interval = 2000, profileId } = options;

  const [coreStats, setCoreStats] = useState<CoreStats | null>(null);
  const [vfsStats, setVfsStats] = useState<VfsStats | null>(null);
  const [mountStatus, setMountStatus] = useState<string | null>(null);
  const [daemonStatus, setDaemonStatus] = useState<DaemonState | null>(null);
  const [recentTransfers, setRecentTransfers] = useState<CompletedTransferItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!profileId) return;
    try {
      const [statsResult, daemonResult] = await Promise.allSettled([
        invoke<AggregatedStats>('get_aggregated_stats', { profileId }),
        invoke<DaemonState>('get_daemon_status', { profileId }),
      ]);

      if (!mountedRef.current) return;

      if (statsResult.status === 'fulfilled') {
        const data = statsResult.value;
        setCoreStats(data.coreStats);
        setVfsStats(data.vfsStats);
        setMountStatus(data.mountStatus);
        setRecentTransfers(data.recentTransfers?.transferred ?? []);
        setError(null);
      } else {
        setError(String(statsResult.reason));
      }

      if (daemonResult.status === 'fulfilled') {
        setDaemonStatus(daemonResult.value);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !profileId) {
      setCoreStats(null);
      setVfsStats(null);
      setMountStatus(null);
      setIsLoading(false);
      return;
    }

    fetchAll();

    const id = setInterval(fetchAll, interval);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [enabled, interval, fetchAll, profileId]);

  return { coreStats, vfsStats, mountStatus, daemonStatus, recentTransfers, isLoading, error };
}
