import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink, Key, User, Globe, Loader2 } from 'lucide-react';
import { TextInput } from '../ui/TextInput';

const OAUTH_PROVIDERS = ['gdrive', 'onedrive', 'dropbox'];

const PROVIDER_NAMES: Record<string, string> = {
  gdrive: 'Google Drive',
  onedrive: 'OneDrive',
  dropbox: 'Dropbox',
  s3: 'Amazon S3',
  protondrive: 'Proton Drive',
  other: 'Other',
};

const PROVIDER_COLORS: Record<string, string> = {
  gdrive: 'from-blue-500 to-blue-600',
  onedrive: 'from-sky-500 to-sky-600',
  dropbox: 'from-blue-400 to-blue-500',
};

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'sa-east-1', 'ca-central-1', 'me-south-1', 'af-south-1',
];

interface AuthStepProps {
  provider: string;
  authConfig: Record<string, string>;
  onChange: (config: Record<string, string>) => void;
}

export function AuthStep({ provider, authConfig, onChange }: AuthStepProps) {
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const updateField = (key: string, value: string) => {
    onChange({ ...authConfig, [key]: value });
  };

  const handleAuthorize = async () => {
    if (provider === 'gdrive' || provider === 'onedrive') {
      if (!authConfig.clientId?.trim() || !authConfig.clientSecret?.trim()) {
        setError(`Custom Client ID and Client Secret are required for ${provider === 'gdrive' ? 'Google Drive' : 'OneDrive'} to prevent API rate limits and directory lag.`);
        return;
      }
    }
    setIsAuthorizing(true);
    setError('');
    try {
      const token = await invoke<string>('authorize_provider', { 
        provider,
        clientId: authConfig.clientId || null,
        clientSecret: authConfig.clientSecret || null
      });
      onChange({ ...authConfig, token, oauthToken: 'authorized' });
    } catch (e: any) {
      setError(e && typeof e === 'object' && 'message' in e ? e.message : String(e));
    } finally {
      setIsAuthorizing(false);
    }
  };

  const providerName = PROVIDER_NAMES[provider] || provider;

  // ── OAuth Providers ──────────────────────────────────────────────
  if (OAUTH_PROVIDERS.includes(provider)) {
    const gradient = PROVIDER_COLORS[provider] || 'from-violet-500 to-purple-500';
    const isAuthorized = authConfig.oauthToken === 'authorized';

    return (
      <div className="step-enter">
        <h2 className="text-xl font-semibold text-white mb-1">Authorize {providerName}</h2>
        <p className="text-sm text-white/40 mb-6">
          Connect your account by signing in through your browser. Setting up your own API credentials is required to bypass global rate limits.
        </p>

        <div className="flex flex-col items-center gap-6 py-2">
          {!isAuthorized && (
            <div className="w-full max-w-md space-y-4 mb-2 text-left animate-fade-in">
              <TextInput
                label="Custom Client ID"
                value={authConfig.clientId || ''}
                onChange={(val) => updateField('clientId', val)}
                placeholder="Enter custom Client ID"
              />
              <TextInput
                label="Custom Client Secret"
                value={authConfig.clientSecret || ''}
                onChange={(val) => updateField('clientSecret', val)}
                placeholder="Enter custom Client Secret"
              />

              {/* Collapsible Instructions Guide */}
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-violet-400 hover:bg-white/[0.02] transition-colors"
                >
                  <span>How to get your Client ID & Secret (2 mins)</span>
                  <span className={`transform transition-transform ${showGuide ? 'rotate-180' : ''}`}>▼</span>
                </button>
                
                {showGuide && (
                  <div className="px-4 pb-4 space-y-3 text-xs text-white/60 border-t border-white/[0.06] pt-3 leading-relaxed">
                    {provider === 'gdrive' ? (
                      <>
                        <p>1. Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Google Cloud Console</a>.</p>
                        <p>2. Create a new project (or select an existing one).</p>
                        <p>3. Search for <b>Google Drive API</b> and click <b>Enable</b>.</p>
                        <p>4. Configure the <b>OAuth consent screen</b> (User Type: External, Add Scope: <code>.../auth/drive</code>).</p>
                        <p>5. Go to <b>Credentials</b> &rarr; <b>Create Credentials</b> &rarr; <b>OAuth client ID</b>.</p>
                        <p>6. Select Application Type: <b>Desktop App</b>, click Create, and paste the generated Client ID and Client Secret here.</p>
                      </>
                    ) : provider === 'onedrive' ? (
                      <>
                        <p>1. Go to the <a href="https://portal.azure.com/" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Microsoft Azure Portal</a>.</p>
                        <p>2. Select <b>App registrations</b> &rarr; <b>New registration</b>.</p>
                        <p>3. Set Name to <code>StrataFuse</code>, Supported account types to <b>Any organizational directory & personal Accounts</b>.</p>
                        <p>4. Set Redirect URI type to <b>Public client/native</b> and value to <code>http://localhost:53682/</code>.</p>
                        <p>5. Copy the <b>Application (client) ID</b> from the Overview page.</p>
                        <p>6. Go to <b>Certificates & secrets</b> &rarr; <b>New client secret</b> and copy the Value.</p>
                      </>
                    ) : provider === 'dropbox' ? (
                      <>
                        <p>1. Go to the <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Dropbox App Console</a>.</p>
                        <p>2. Click <b>Create app</b>, select <b>Scoped access</b>, and choose <b>Full Dropbox</b> access.</p>
                        <p>3. Under the <b>Permissions</b> tab, check: <code>files.metadata.read/write</code> and <code>files.content.read/write</code>.</p>
                        <p>4. In the <b>Settings</b> tab, copy your <b>App key</b> (Client ID) and <b>App secret</b> (Client Secret).</p>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isAuthorized ? (
            <>
              <button
                onClick={handleAuthorize}
                disabled={isAuthorizing}
                className={`
                  relative group px-8 py-4 rounded-xl font-semibold text-white text-base
                  bg-gradient-to-r ${gradient}
                  hover:shadow-[0_0_30px_rgba(139,92,246,0.3)]
                  transition-all duration-300 hover:scale-[1.02]
                  flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {isAuthorizing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin-slow" />
                    Waiting for Authorization...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-5 h-5" />
                    Authorize with {providerName}
                  </>
                )}
              </button>

              <p className="text-xs text-white/30 text-center max-w-xs animate-fade-in">
                Your browser will open for secure OAuth authentication.
                Token will be captured automatically.
              </p>

              {error && (
                <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center max-w-md animate-fade-in">
                  {error}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-green-400">Authorization successful</p>
              <p className="text-xs text-white/40">Your {providerName} account is connected.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── S3 Provider ──────────────────────────────────────────────────
  if (provider === 's3') {
    return (
      <div className="step-enter">
        <h2 className="text-xl font-semibold text-white mb-1">S3 Configuration</h2>
        <p className="text-sm text-white/40 mb-6">
          Enter your S3-compatible storage credentials.
        </p>

        <div className="space-y-4">
          <TextInput
            label="Access Key ID"
            value={authConfig.accessKeyId || ''}
            onChange={(v) => updateField('accessKeyId', v)}
            icon={Key}
            placeholder="AKIAIOSFODNN7EXAMPLE"
          />

          <TextInput
            label="Secret Access Key"
            value={authConfig.secretAccessKey || ''}
            onChange={(v) => updateField('secretAccessKey', v)}
            type="password"
            icon={Key}
            placeholder="••••••••••••••••"
          />

          {/* Region dropdown */}
          <div className="relative">
            <label className="block text-[10px] font-medium text-white/40 mb-1.5 ml-1">Region</label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <select
                value={authConfig.region || 'us-east-1'}
                onChange={(e) => updateField('region', e.target.value)}
                className="
                  w-full rounded-xl pl-11 pr-4 py-3
                  bg-white/[0.03] text-white text-sm
                  border border-white/[0.06] outline-none
                  focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20
                  transition-all duration-200
                  appearance-none cursor-pointer
                "
              >
                {AWS_REGIONS.map((r) => (
                  <option key={r} value={r} className="bg-[#1a1a2e] text-white">{r}</option>
                ))}
              </select>
            </div>
          </div>

          <TextInput
            label="Bucket Name"
            value={authConfig.bucket || ''}
            onChange={(v) => updateField('bucket', v)}
            placeholder="my-bucket"
          />
        </div>
      </div>
    );
  }

  // ── Proton Drive ────────────────────────────────────────────────
  if (provider === 'protondrive') {
    return (
      <div className="step-enter">
        <h2 className="text-xl font-semibold text-white mb-1">Proton Drive Login</h2>
        <p className="text-sm text-white/40 mb-6">
          Enter your Proton account credentials.
        </p>

        <div className="space-y-4">
          <TextInput
            label="Username"
            value={authConfig.username || ''}
            onChange={(v) => updateField('username', v)}
            icon={User}
            placeholder="user@proton.me"
          />

          <TextInput
            label="Password"
            value={authConfig.password || ''}
            onChange={(v) => updateField('password', v)}
            type="password"
            icon={Key}
            placeholder="••••••••"
          />
        </div>
      </div>
    );
  }

  // ── Other (existing rclone remote) ──────────────────────────────
  return (
    <div className="step-enter">
      <h2 className="text-xl font-semibold text-white mb-1">Custom Remote</h2>
      <p className="text-sm text-white/40 mb-6">
        Enter the name of an existing rclone remote you&apos;ve already configured.
      </p>

      <TextInput
        label="Remote Name"
        value={authConfig.remoteName || ''}
        onChange={(v) => updateField('remoteName', v)}
        placeholder="myremote"
      />

      <p className="mt-3 text-xs text-white/30">
        This should match a remote in your rclone config (e.g., the name used in <code className="text-white/50">rclone config</code>).
      </p>
    </div>
  );
}
