import { Info } from 'lucide-react';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { TextInput } from '../ui/TextInput';

// Generate drive letters D: through Z: (excluding C:)
const DRIVE_LETTERS = Array.from({ length: 23 }, (_, i) => String.fromCharCode(68 + i) + ':');

interface ScopeStepProps {
  mountEntireDrive: boolean;
  subDirectory: string;
  useCrypt: boolean;
  cryptPassword: string;
  cryptPassword2: string;
  mountPoint: string;
  onUpdate: (field: string, value: string | boolean) => void;
  errors: Record<string, string>;
}

export function ScopeStep({
  mountEntireDrive,
  subDirectory,
  useCrypt,
  cryptPassword,
  cryptPassword2,
  mountPoint,
  onUpdate,
  errors,
}: ScopeStepProps) {
  return (
    <div className="step-enter space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Mount Options</h2>
        <p className="text-sm text-white/40 mb-6">Configure what to mount and how to protect your data.</p>
      </div>

      {/* ── Mount Scope ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <ToggleSwitch
          label="Mount Entire Drive"
          description="Mount the root of your cloud storage"
          checked={mountEntireDrive}
          onChange={(v) => onUpdate('mountEntireDrive', v)}
        />

        {!mountEntireDrive && (
          <div className="ml-15 animate-fade-in">
            <TextInput
              label="Subdirectory Path"
              value={subDirectory}
              onChange={(v) => onUpdate('subDirectory', v)}
              placeholder="path/to/folder"
              error={errors.subDirectory}
            />
          </div>
        )}
      </div>

      {/* ── Crypt Layer ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <ToggleSwitch
          label="Enable Zero-Knowledge Crypt Layer"
          description="Encrypt all files before uploading to the cloud"
          checked={useCrypt}
          onChange={(v) => onUpdate('useCrypt', v)}
        />

        {useCrypt && (
          <div className="ml-15 space-y-3 animate-fade-in">
            <TextInput
              label="Encryption Password"
              value={cryptPassword}
              onChange={(v) => onUpdate('cryptPassword', v)}
              type="password"
              placeholder="••••••••"
              error={errors.cryptPassword}
            />

            <TextInput
              label="Confirm Password"
              value={cryptPassword2}
              onChange={(v) => onUpdate('cryptPassword2', v)}
              type="password"
              placeholder="••••••••"
              error={errors.cryptPassword2}
            />

            {/* Info box */}
            <div className="flex gap-3 p-3 rounded-xl bg-cyan-400/[0.05] border border-cyan-400/20">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-cyan-300/80 leading-relaxed">
                Files are encrypted locally before upload using AES-256. Your cloud provider cannot read your data.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Mount Point ────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-white mb-3">Mount Point (Drive Letter)</label>
        <div className="flex flex-wrap gap-2">
          {DRIVE_LETTERS.map((letter) => {
            const isSelected = mountPoint === letter;
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onUpdate('mountPoint', letter)}
                className={`
                  w-11 h-9 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${isSelected
                    ? 'bg-violet-500 text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                    : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white/70'
                  }
                `}
              >
                {letter}
              </button>
            );
          })}
        </div>
        {errors.mountPoint && (
          <p className="mt-2 text-xs text-red-400">{errors.mountPoint}</p>
        )}
      </div>
    </div>
  );
}
