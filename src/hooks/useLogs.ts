import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LogEntry, LogQueryResponse } from '../lib/types';

interface UseLogsOptions {
  count?: number;
  enabled?: boolean;
  interval?: number;
  profileId: string;
}

interface UseLogsReturn {
  entries: LogEntry[];
  totalLines: number;
  isLoading: boolean;
}

export function useLogs(options: UseLogsOptions): UseLogsReturn {
  const { count = 200, enabled = true, interval = 3000, profileId } = options;

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const mountedRef = useRef(true);

  const fetchLogs = useCallback(async () => {
    if (!profileId) return;
    try {
      const response = await invoke<LogQueryResponse>('get_recent_logs', { count, profileId });
      if (mountedRef.current) {
        setEntries(response.entries);
        setTotalLines(response.totalLines);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [count, profileId]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || !profileId) {
      setEntries([]);
      setTotalLines(0);
      setIsLoading(false);
      return;
    }

    fetchLogs();

    const id = setInterval(fetchLogs, interval);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [enabled, interval, fetchLogs, profileId]);

  return { entries, totalLines, isLoading };
}
