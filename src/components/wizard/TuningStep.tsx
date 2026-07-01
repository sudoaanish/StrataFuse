import { Zap, Activity, Upload, Check, Loader2 } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { TextInput } from '../ui/TextInput';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

interface TuningOption {
  id: 'media' | 'general' | 'backup';
  name: string;
  subtitle: string;
  description: string;
  icon: ComponentType<LucideProps>;
  accentColor: string;
  borderColor: string;
  iconBg: string;
}

const TUNING_OPTIONS: TuningOption[] = [
  {
    id: 'media',
    name: 'Media Streaming',
    subtitle: 'Optimized for Jellyfin, Plex, and Emby',
    description: 'VFS cache: full, 100GB max. Network mode enabled. Best for streaming large media files with minimal buffering.',
    icon: Zap,
    accentColor: 'text-violet-400',
    borderColor: 'border-violet-500/50',
    iconBg: 'bg-violet-500/20',
  },
  {
    id: 'general',
    name: 'General Purpose',
    subtitle: 'Balanced performance for everyday use',
    description: 'VFS cache: writes, 10GB max. Good for documents, photos, and general file access.',
    icon: Activity,
    accentColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/50',
    iconBg: 'bg-cyan-500/20',
  },
  {
    id: 'backup',
    name: 'Backup / Sync',
    subtitle: 'Minimal caching for data backup',
    description: 'VFS cache: minimal, 1GB max. Efficient for backup workloads and sync operations.',
    icon: Upload,
    accentColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/50',
    iconBg: 'bg-emerald-500/20',
  },
];

interface TuningStepProps {
  tuningProfile: 'media' | 'general' | 'backup';
  profileName: string;
  autoMount: boolean;
  bwlimit: string;
  onSelectTuning: (profile: 'media' | 'general' | 'backup') => void;
  onProfileNameChange: (name: string) => void;
  onChangeAutoMount: (autoMount: boolean) => void;
  onBwlimitChange: (limit: string) => void;
  onCreateProfile: () => void;
  isCreating: boolean;
  canCreate: boolean;
  isEditing?: boolean;
}

export function TuningStep({
  tuningProfile,
  profileName,
  autoMount,
  bwlimit,
  onSelectTuning,
  onProfileNameChange,
  onChangeAutoMount,
  onBwlimitChange,
  onCreateProfile,
  isCreating,
  canCreate,
  isEditing = false,
}: TuningStepProps) {
  return (
    <div className="step-enter space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Performance Tuning</h2>
        <p className="text-sm text-white/40 mb-6">Choose a tuning profile and name your mount.</p>
      </div>

      {/* ── Tuning Profile Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TUNING_OPTIONS.map((option) => {
          const isSelected = tuningProfile === option.id;
          const Icon = option.icon;

          return (
            <GlassCard
              key={option.id}
              hover
              onClick={() => onSelectTuning(option.id)}
              className={`
                relative p-4 transition-all duration-300
                ${isSelected ? `${option.borderColor} bg-white/[0.05] ring-1 ring-white/[0.08]` : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}

              <div className={`w-9 h-9 rounded-lg ${option.iconBg} flex items-center justify-center mb-3`}>
                <Icon className={`w-4.5 h-4.5 ${option.accentColor}`} />
              </div>

              <h3 className="text-sm font-semibold text-white mb-0.5">{option.name}</h3>
              <p className={`text-[11px] ${option.accentColor} mb-2`}>{option.subtitle}</p>
              <p className="text-[11px] text-white/35 leading-relaxed">{option.description}</p>
            </GlassCard>
          );
        })}
      </div>

      {/* ── Profile Name ───────────────────────────────────────────── */}
      <TextInput
        label="Profile Name"
        value={profileName}
        onChange={onProfileNameChange}
        placeholder="My Cloud Mount"
      />

      {/* ── Bandwidth Throttling ────────────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/60">Bandwidth Throttling (Speed Limit)</label>
        <div className="relative">
          <select
            value={bwlimit || ''}
            onChange={(e) => onBwlimitChange(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all font-medium appearance-none cursor-pointer"
          >
            <option value="" className="bg-[#0b0c16] text-white">No Speed Limit (Maximum Performance)</option>
            <option value="10M" className="bg-[#0b0c16] text-white">10 MB/s (High Speed)</option>
            <option value="5M" className="bg-[#0b0c16] text-white">5 MB/s (Balanced)</option>
            <option value="2M" className="bg-[#0b0c16] text-white">2 MB/s (Eco Throttling)</option>
            <option value="1M" className="bg-[#0b0c16] text-white">1 MB/s (Minimal background usage)</option>
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30 text-[10px]">
            ▼
          </div>
        </div>
      </div>

      {/* ── Auto Mount Toggle ──────────────────────────────────────── */}
      <ToggleSwitch
        label="Mount automatically on startup"
        description="Launch this drive automatically when StrataFuse starts"
        checked={autoMount}
        onChange={onChangeAutoMount}
      />

      {/* ── Create Button ──────────────────────────────────────────── */}
      <button
        onClick={onCreateProfile}
        disabled={!canCreate || isCreating}
        className={`
          w-full py-3.5 rounded-xl font-semibold text-sm
          flex items-center justify-center gap-2.5
          transition-all duration-300
          ${canCreate && !isCreating
            ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:scale-[1.01]'
            : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
          }
        `}
      >
        {isCreating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isEditing ? 'Saving Profile…' : 'Creating Profile…'}
          </>
        ) : (
          isEditing ? 'Save Profile' : 'Create Mount Profile'
        )}
      </button>
    </div>
  );
}
