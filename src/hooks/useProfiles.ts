import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MountProfile } from '../lib/types';

interface UseProfilesReturn {
  profiles: MountProfile[];
  isLoading: boolean;
  error: string | null;
  createProfile: (profile: Omit<MountProfile, 'id' | 'createdAt' | 'lastUsed'>) => Promise<MountProfile>;
  deleteProfile: (id: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<MountProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await invoke<MountProfile[]>('list_profiles');
      setProfiles(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error('Failed to list profiles:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createProfile = useCallback(
    async (profile: Omit<MountProfile, 'id' | 'createdAt' | 'lastUsed'>): Promise<MountProfile> => {
      const created = await invoke<MountProfile>('create_profile', { profile });
      setProfiles((prev) => [...prev, created]);
      return created;
    },
    [],
  );

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    await invoke<void>('delete_profile', { id });
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  return { profiles, isLoading, error, createProfile, deleteProfile, refreshProfiles };
}
