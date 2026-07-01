import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MountProfile } from '../lib/types';
import { formatRelativeTime } from '../lib/format';
import { useToast } from '../contexts/ToastContext';
import { Cloud, HardDrive, Database, Shield, Server, Plus, Play, Trash2, Loader2, Edit, Activity, Folder } from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

const PROVIDER_ICONS: Record<string, ComponentType<LucideProps>> = {
  gdrive: Cloud,
  onedrive: HardDrive,
  dropbox: Database,
  s3: Shield,
  protondrive: Server,
  other: Server,
};

const PROVIDER_COLORS: Record<string, string> = {
  gdrive: 'text-cyan-400',
  onedrive: 'text-sky-400',
  dropbox: 'text-blue-400',
  s3: 'text-amber-400',
  protondrive: 'text-purple-400',
  other: 'text-white/40',
};

interface Props {
  profiles: MountProfile[];
  onMount: (profile: MountProfile) => void;
  onCreateNew: () => void;
  onEdit: (profile: MountProfile) => void;
  onRefresh: () => void;
}

export function ProfileSelector({ profiles, onMount, onCreateNew, onEdit, onRefresh }: Props) {
  const [mounting, setMounting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activeMounts, setActiveMounts] = useState<string[]>([]);
  const { addToast } = useToast();

  const loadActiveMounts = useCallback(async () => {
    try {
      const active = await invoke<string[]>('get_active_mounts');
      setActiveMounts(active);
    } catch (err) {
      console.error('Failed to get active mounts:', err);
    }
  }, []);

  useEffect(() => {
    loadActiveMounts();
    const id = setInterval(loadActiveMounts, 3000);
    return () => clearInterval(id);
  }, [loadActiveMounts]);

  const handleMount = async (profile: MountProfile) => {
    setMounting(profile.id);
    try {
      await invoke('start_mount', { profileId: profile.id });
      onMount(profile);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addToast('error', `Failed to mount: ${msg}`);
      setMounting(null);
    }
  };

  const handleCardClick = (profile: MountProfile) => {
    if (activeMounts.includes(profile.id)) {
      onMount(profile);
    } else {
      handleMount(profile);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleting === id) {
      try {
        await invoke('delete_profile', { id });
        onRefresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addToast('error', `Failed to delete profile: ${msg}`);
      }
      setDeleting(null);
    } else {
      setDeleting(id);
      setTimeout(() => setDeleting(null), 3000);
    }
  };

  const handleEditClick = (e: React.MouseEvent, profile: MountProfile) => {
    e.stopPropagation();
    if (activeMounts.includes(profile.id)) {
      addToast('warning', 'Please stop this mount before editing its configuration.');
      return;
    }
    onEdit(profile);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (activeMounts.includes(id)) {
      addToast('warning', 'Please stop this mount before deleting the profile.');
      return;
    }
    handleDelete(id);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 relative z-10">
      <div className="w-full max-w-3xl animate-fade-in">
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/stratafuse-withtext.png" alt="StrataFuse" className="h-36 mx-auto -mt-24 mb-8 select-none pointer-events-none" />
          <p className="text-white/40 text-xs">Select a profile to mount or edit settings</p>
        </div>

        {/* Profile Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => {
            const Icon = PROVIDER_ICONS[profile.provider] || Server;
            const color = PROVIDER_COLORS[profile.provider] || 'text-white/50';
            const isMounting = mounting === profile.id;
            const isActive = activeMounts.includes(profile.id);

            return (
              <div
                key={profile.id}
                onClick={() => handleCardClick(profile)}
                className={`glass-card p-5 flex flex-col relative group cursor-pointer transition-all duration-300
                  ${isActive 
                    ? 'border-emerald-500/45 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.08)]' 
                    : 'glass-card-hover'
                  }
                `}
              >
                {/* Edit button */}
                {!isActive && (
                  <button
                    onClick={(e) => handleEditClick(e, profile)}
                    className="absolute top-3 right-10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/80 hover:bg-white/[0.06] transition-all duration-200 z-20"
                    title="Edit profile"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Delete button */}
                {!isActive && (
                  <button
                    onClick={(e) => handleDeleteClick(e, profile.id)}
                    className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all duration-200 z-20
                      ${deleting === profile.id
                        ? 'opacity-100 bg-red-500 text-white hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                        : 'opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 hover:bg-red-500/10'
                      }
                    `}
                    title={deleting === profile.id ? 'Click again to confirm' : 'Delete profile'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Provider Icon + Name */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg bg-white/[0.04] ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-white truncate">{profile.name}</h3>
                      {isActive && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/30 truncate">{profile.remote}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="flex items-center gap-3 mb-4 text-xs text-white/40">
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] font-mono">{profile.mountPoint}</span>
                  <span className="truncate">{profile.lastUsed ? formatRelativeTime(profile.lastUsed) : 'Never used'}</span>
                </div>

                {/* Actions Button Row */}
                <div className="mt-auto flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCardClick(profile); }}
                    disabled={isMounting}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50
                      ${isActive 
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25' 
                        : 'bg-accent-violet hover:bg-accent-violet/90 text-white shadow-[0_0_12px_rgba(136,192,208,0.15)]'
                      }
                    `}
                  >
                    {isMounting ? (
                      <><Loader2 className="w-4 h-4 animate-spin-slow" /> Mounting...</>
                    ) : isActive ? (
                      <><Activity className="w-4 h-4 animate-pulse" /> Dashboard</>
                    ) : (
                      <><Play className="w-4 h-4" /> Mount</>
                    )}
                  </button>

                  {isActive && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await invoke('open_in_explorer', { mountPoint: profile.mountPoint });
                        } catch (err) {
                          addToast('error', `Failed to open Explorer: ${err}`);
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-all"
                      title="Open in Windows Explorer"
                    >
                      <Folder className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Delete confirm overlay */}
                {deleting === profile.id && (
                  <div 
                    onClick={(e) => { e.stopPropagation(); setDeleting(null); }}
                    className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center backdrop-blur-sm z-10 cursor-default"
                  >
                    <p className="text-xs text-red-400 font-medium">Click trash again to confirm delete</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Create New Card */}
          <button
            onClick={onCreateNew}
            className="glass-card p-5 flex flex-col items-center justify-center gap-3 border border-dashed border-white/10 hover:border-violet-500/40 hover:bg-white/[0.02] text-white/40 hover:text-violet-400 transition-all cursor-pointer group min-h-[175px]"
          >
            <div className="w-10 h-10 rounded-full border border-dashed border-white/20 group-hover:border-violet-500/40 flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">Create New Mount</span>
          </button>
        </div>
      </div>
    </div>
  );
}
