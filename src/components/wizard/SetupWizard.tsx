import { useState, useReducer } from 'react';
import type { WizardData, MountProfile } from '../../lib/types';
import { StepIndicator } from '../ui/StepIndicator';
import { ProviderStep } from './ProviderStep';
import { AuthStep } from './AuthStep';
import { ScopeStep } from './ScopeStep';
import { TuningStep } from './TuningStep';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

const STEPS = ['Provider', 'Authentication', 'Scope & Encryption', 'Tuning'];

const initialData: WizardData = {
  provider: '',
  authConfig: {},
  mountEntireDrive: true,
  subDirectory: '',
  useCrypt: false,
  cryptPassword: '',
  cryptPassword2: '',
  mountPoint: 'X:',
  tuningProfile: 'general',
  profileName: '',
  autoMount: false,
  bwlimit: '',
};

type Action =
  | { type: 'UPDATE'; payload: Partial<WizardData> }
  | { type: 'RESET'; payload?: WizardData };

function reducer(state: WizardData, action: Action): WizardData {
  switch (action.type) {
    case 'UPDATE': return { ...state, ...action.payload };
    case 'RESET': return action.payload || initialData;
    default: return state;
  }
}

const PROVIDER_NAMES: Record<string, string> = {
  gdrive: 'Google Drive', onedrive: 'OneDrive', s3: 'Amazon S3',
  dropbox: 'Dropbox', protondrive: 'Proton Drive', other: 'Custom Remote',
};

interface Props {
  onComplete: () => void;
  onCancel?: () => void;
  editingProfile?: MountProfile | null;
}

export function SetupWizard({ onComplete, onCancel, editingProfile = null }: Props) {
  const getInitialState = (): WizardData => {
    if (editingProfile) {
      const colonIdx = editingProfile.remote.indexOf(':');
      const subPath = colonIdx !== -1 ? editingProfile.remote.substring(colonIdx + 1) : '';
      const remoteName = colonIdx !== -1 ? editingProfile.remote.substring(0, colonIdx) : '';

      const authConfig: Record<string, string> = { ...editingProfile.credentials };
      if (editingProfile.provider === 'other') {
        authConfig.remoteName = remoteName;
      } else if (['gdrive', 'onedrive', 'dropbox'].includes(editingProfile.provider)) {
        authConfig.oauthToken = editingProfile.credentials?.token ? 'authorized' : '';
      } else if (editingProfile.provider === 's3') {
        authConfig.bucket = subPath;
      }

      const tuningMap: Record<string, 'media' | 'general' | 'backup'> = {
        media_streaming: 'media',
        general_purpose: 'general',
        backup_sync: 'backup',
      };

      return {
        provider: editingProfile.provider,
        authConfig,
        mountEntireDrive: !subPath || editingProfile.provider === 's3',
        subDirectory: editingProfile.provider !== 's3' ? subPath : '',
        useCrypt: editingProfile.useCrypt,
        cryptPassword: editingProfile.credentials?.cryptPassword || '',
        cryptPassword2: editingProfile.credentials?.cryptPassword || '',
        mountPoint: editingProfile.mountPoint,
        tuningProfile: tuningMap[editingProfile.tuningProfile] || 'media',
        profileName: editingProfile.name,
        autoMount: editingProfile.autoMount || false,
        bwlimit: editingProfile.bwlimit || '',
      };
    }
    return initialData;
  };

  const [step, setStep] = useState(0);
  const [data, dispatch] = useReducer(reducer, getInitialState());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (fields: Partial<WizardData>) => {
    dispatch({ type: 'UPDATE', payload: fields });
    setError('');
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return !!data.provider;
      case 1: {
        if (['gdrive', 'onedrive', 'dropbox'].includes(data.provider)) {
          return data.authConfig.oauthToken === 'authorized';
        }
        if (data.provider === 's3') {
          return !!data.authConfig.accessKeyId && !!data.authConfig.secretAccessKey && !!data.authConfig.region && !!data.authConfig.bucket;
        }
        if (data.provider === 'protondrive') {
          return !!data.authConfig.username && !!data.authConfig.password;
        }
        if (data.provider === 'other') {
          return !!data.authConfig.remoteName;
        }
        return false;
      }
      case 2: {
        const errors = getScopeErrors();
        return Object.keys(errors).length === 0;
      }
      case 3: return !!data.profileName;
      default: return false;
    }
  };

  const handleNext = () => {
    if (!canProceed()) return;
    setCompletedSteps(prev => new Set([...prev, step]));
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      // Auto-generate profile name on entering tuning step
      if (step === 2 && !data.profileName) {
        const providerName = PROVIDER_NAMES[data.provider] || data.provider;
        update({ profileName: `${providerName} - ${data.mountPoint}` });
      }
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    } else if (onCancel) {
      onCancel();
    }
    setError('');
  };

  const handleCreate = async () => {
    if (!canProceed()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const tuningMap: Record<string, { mode: string; size: string; network: boolean }> = {
        media: { mode: 'full', size: '100G', network: true },
        general: { mode: 'full', size: '10G', network: false },
        backup: { mode: 'minimal', size: '1G', network: false },
      };
      const tuning = tuningMap[data.tuningProfile] || tuningMap.media;

      // Extract credentials based on provider type
      const credentials: Record<string, string> = {};
      let remote = '';

      if (data.provider === 's3') {
        const bucket = data.authConfig.bucket || '';
        remote = `s3:${bucket}`;
        if (data.authConfig.accessKeyId) credentials.accessKeyId = data.authConfig.accessKeyId;
        if (data.authConfig.secretAccessKey) credentials.secretAccessKey = data.authConfig.secretAccessKey;
        if (data.authConfig.region) credentials.region = data.authConfig.region;
      } else if (data.provider === 'protondrive') {
        const subPath = data.mountEntireDrive ? '' : (data.subDirectory || '');
        remote = `protondrive:${subPath}`;
        if (data.authConfig.username) credentials.username = data.authConfig.username;
        if (data.authConfig.password) {
          if (editingProfile && data.authConfig.password === editingProfile.credentials?.password) {
            credentials.password = data.authConfig.password;
          } else {
            // Obscure password using backend sidecar
            const obscuredProtonPass = await invoke<string>('obscure_password', { password: data.authConfig.password });
            credentials.password = obscuredProtonPass;
          }
        }
      } else if (data.provider === 'other') {
        const base = data.authConfig.remoteName ? `${data.authConfig.remoteName}:` : 'other:';
        const subPath = data.mountEntireDrive ? '' : (data.subDirectory || '');
        remote = `${base}${subPath}`;
      } else {
        // OAuth-based (gdrive, onedrive, dropbox)
        const subPath = data.mountEntireDrive ? '' : (data.subDirectory || '');
        remote = `${data.provider}:${subPath}`;
        if (data.authConfig.token) credentials.token = data.authConfig.token;
        if (data.authConfig.clientId) credentials.clientId = data.authConfig.clientId;
        if (data.authConfig.clientSecret) credentials.clientSecret = data.authConfig.clientSecret;
      }

      // If zero-knowledge encryption is enabled, obscure cryptPassword
      if (data.useCrypt && data.cryptPassword) {
        if (editingProfile && data.cryptPassword === editingProfile.credentials?.cryptPassword) {
          credentials.cryptPassword = data.cryptPassword;
        } else {
          const obscuredCryptPass = await invoke<string>('obscure_password', { password: data.cryptPassword });
          credentials.cryptPassword = obscuredCryptPass;
        }
      }

      const profile = {
        id: editingProfile ? editingProfile.id : '',
        name: data.profileName,
        provider: data.provider,
        remote,
        mountPoint: data.mountPoint,
        useCrypt: data.useCrypt,
        cryptRemote: data.useCrypt ? remote : null,
        tuningProfile: data.tuningProfile === 'media' ? 'media_streaming' : data.tuningProfile === 'general' ? 'general_purpose' : 'backup_sync',
        vfsCacheMode: tuning.mode,
        vfsCacheMaxSize: tuning.size,
        networkMode: tuning.network,
        rcAddr: editingProfile ? editingProfile.rcAddr : '127.0.0.1:5572',
        rcUser: editingProfile ? editingProfile.rcUser : 'uplink',
        rcPass: editingProfile ? editingProfile.rcPass : 'local-status-only',
        createdAt: editingProfile ? editingProfile.createdAt : new Date().toISOString(),
        lastUsed: editingProfile ? editingProfile.lastUsed : null,
        credentials,
        autoMount: data.autoMount,
        bwlimit: data.bwlimit || null,
      };

      if (editingProfile) {
        await invoke('update_profile', { id: editingProfile.id, profile });
      } else {
        await invoke('create_profile', { profile });
      }
      onComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getScopeErrors = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.mountPoint) errs.mountPoint = 'Please select a drive letter';
    if (data.useCrypt) {
      if (!data.cryptPassword) errs.cryptPassword = 'Password is required';
      else if (data.cryptPassword.length < 8) errs.cryptPassword = 'Password must be at least 8 characters';
      if (data.cryptPassword2 && data.cryptPassword !== data.cryptPassword2) {
        errs.cryptPassword2 = 'Passwords do not match';
      }
    }
    if (!data.mountEntireDrive && !data.subDirectory) {
      errs.subDirectory = 'Please enter a subdirectory path';
    }
    return errs;
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-8 relative z-10">
      <div className="glass-card w-full max-w-2xl p-8 shadow-2xl overflow-y-auto max-h-[85vh]">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/stratafuse-withtext.png" alt="StrataFuse" className="h-36 mx-auto -mt-24 mb-8 select-none pointer-events-none" />
          <p className="text-white/40 text-xs">Create a new cloud mount profile</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator steps={STEPS} currentStep={step} completedSteps={completedSteps} />

        {/* Step Content */}
        <div key={step} className="animate-slide-in mt-8 min-h-[320px]">
          {step === 0 && (
            <ProviderStep
              selected={data.provider}
              onSelect={(val) => update({
                provider: val,
                authConfig: val === 's3' ? { region: 'us-east-1' } : {},
              })}
            />
          )}
          {step === 1 && (
            <AuthStep
              provider={data.provider}
              authConfig={data.authConfig}
              onChange={(val) => update({ authConfig: val })}
            />
          )}
          {step === 2 && (
            <ScopeStep
              mountEntireDrive={data.mountEntireDrive}
              subDirectory={data.subDirectory}
              useCrypt={data.useCrypt}
              cryptPassword={data.cryptPassword}
              cryptPassword2={data.cryptPassword2}
              mountPoint={data.mountPoint}
              onUpdate={(field, val) => {
                if (field === 'mountEntireDrive' && !val && !data.subDirectory) {
                  update({ mountEntireDrive: false, subDirectory: 'StrataFuse' });
                } else {
                  update({ [field]: val });
                }
              }}
              errors={getScopeErrors()}
            />
          )}
          {step === 3 && (
            <TuningStep
              tuningProfile={data.tuningProfile}
              profileName={data.profileName}
              autoMount={data.autoMount}
              bwlimit={data.bwlimit || ''}
              onSelectTuning={(val) => update({ tuningProfile: val })}
              onProfileNameChange={(val) => update({ profileName: val })}
              onChangeAutoMount={(val) => update({ autoMount: val })}
              onBwlimitChange={(val) => update({ bwlimit: val })}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-white/[0.06]">
          <button
            onClick={handleBack}
            disabled={step === 0 && !onCancel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!canProceed() || isSubmitting}
              className="flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin-slow" /> {editingProfile ? 'Saving...' : 'Creating...'}</>
              ) : (
                editingProfile ? 'Save Profile' : 'Create Mount Profile'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
