import { Cloud, HardDrive, Database, Shield, Server, Check } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

interface ProviderOption {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<LucideProps>;
  color: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Full access to your Google Drive files',
    icon: Cloud,
    color: 'text-blue-400',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Microsoft OneDrive personal & business',
    icon: HardDrive,
    color: 'text-sky-400',
  },
  {
    id: 's3',
    name: 'Amazon S3',
    description: 'S3-compatible object storage',
    icon: Database,
    color: 'text-orange-400',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Dropbox personal & team spaces',
    icon: HardDrive,
    color: 'text-blue-300',
  },
  {
    id: 'protondrive',
    name: 'Proton Drive',
    description: 'End-to-end encrypted cloud storage',
    icon: Shield,
    color: 'text-purple-400',
  },
  {
    id: 'other',
    name: 'Other',
    description: 'Any rclone-supported backend',
    icon: Server,
    color: 'text-gray-400',
  },
];

interface ProviderStepProps {
  selected: string;
  onSelect: (provider: string) => void;
}

export function ProviderStep({ selected, onSelect }: ProviderStepProps) {
  return (
    <div className="step-enter">
      <h2 className="text-xl font-semibold text-white mb-1">Choose Your Cloud Provider</h2>
      <p className="text-sm text-white/40 mb-6">Select the cloud storage service you want to mount as a local drive.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PROVIDERS.map((provider) => {
          const isSelected = selected === provider.id;
          const Icon = provider.icon;

          return (
            <GlassCard
              key={provider.id}
              hover
              onClick={() => onSelect(provider.id)}
              className={`
                relative p-4 text-center transition-all duration-300
                ${isSelected
                  ? 'border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30'
                  : ''
                }
              `}
            >
              {/* Selected overlay check */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}

              <div className={`mx-auto mb-3 w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center ${provider.color}`}>
                <Icon className="w-5 h-5" />
              </div>

              <h3 className="text-sm font-semibold text-white mb-1">{provider.name}</h3>
              <p className="text-[11px] text-white/40 leading-relaxed">{provider.description}</p>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
