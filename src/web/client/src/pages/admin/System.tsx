import { useState, useEffect } from 'react';
import { admin, SystemConfig } from '../../api';

type ModelOption = 'haiku' | 'sonnet' | 'opus';
const MODEL_OPTIONS: ModelOption[] = ['haiku', 'sonnet', 'opus'];
const ORCHESTRATOR_PROVIDERS = ['haiku', 'ollama'] as const;

export default function System() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Editable state
  const [executor, setExecutor] = useState({ default: 'sonnet', simple: 'haiku', complex: 'opus' });
  const [orchestrator, setOrchestrator] = useState<{ provider: string; fallback: string | null; options?: any }>({ provider: 'haiku', fallback: null });
  const [channelsWa, setChannelsWa] = useState({ enabled: false, number: '' });
  const [channelsTg, setChannelsTg] = useState({ enabled: false });
  const [web, setWeb] = useState({ port: 3000, host: 'localhost' });
  const [user, setUser] = useState({ name: '', preferredName: '', timezone: '' });
  const [debug, setDebug] = useState({ enabled: false, retentionDays: 30 });
  const [brevo, setBrevo] = useState({ defaultSenderName: '', defaultSenderEmail: '' });
  const [ollamaTest, setOllamaTest] = useState<{ testing: boolean; result: { ok: boolean; message: string; durationMs: number } | null }>({ testing: false, result: null });

  // Credential fields
  const [apiKey, setApiKey] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [brevoApiKey, setBrevoApiKey] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await admin.system();
      setConfig(data);
      setExecutor({ ...data.ai.executor });
      setOrchestrator({ provider: data.orchestrator.provider, fallback: data.orchestrator.fallback, options: data.orchestrator.options });
      setChannelsWa({ enabled: data.channels.whatsapp.enabled, number: data.channels.whatsapp.number || '' });
      setChannelsTg({ enabled: data.channels.telegram.enabled });
      setWeb({ port: data.web?.port || 3000, host: data.web?.host || 'localhost' });
      setUser({ name: data.user?.name || '', preferredName: data.user?.preferredName || '', timezone: data.user?.timezone || '' });
      setDebug({ enabled: data.debug?.enabled || false, retentionDays: data.debug?.retentionDays || 30 });
      setBrevo({ defaultSenderName: data.brevo?.defaultSenderName || '', defaultSenderEmail: data.brevo?.defaultSenderEmail || '' });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await admin.updateSystem({
        ai: { executor },
        orchestrator,
        channels: {
          whatsapp: channelsWa,
          telegram: channelsTg,
        },
        web,
        user,
        debug,
        brevo,
      });
      setSuccess('Configuration saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateApiKey = async () => {
    if (!apiKey) return;
    setError('');
    try {
      await admin.updateCredentials({ apiKey });
      setApiKey('');
      setSuccess('API key updated.');
      setTimeout(() => setSuccess(''), 3000);
      await loadConfig();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateTgToken = async () => {
    if (!tgToken) return;
    setError('');
    try {
      await admin.updateCredentials({ telegramBotToken: tgToken });
      setTgToken('');
      setSuccess('Telegram bot token updated.');
      setTimeout(() => setSuccess(''), 3000);
      await loadConfig();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateBrevoKey = async () => {
    if (!brevoApiKey) return;
    setError('');
    try {
      await admin.updateCredentials({ brevoApiKey });
      setBrevoApiKey('');
      setSuccess('Brevo API key updated.');
      setTimeout(() => setSuccess(''), 3000);
      await loadConfig();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateGoogleCreds = async () => {
    if (!googleClientId && !googleClientSecret) return;
    setError('');
    try {
      const creds: Record<string, string> = {};
      if (googleClientId) creds.googleClientId = googleClientId;
      if (googleClientSecret) creds.googleClientSecret = googleClientSecret;
      await admin.updateCredentials(creds);
      setGoogleClientId('');
      setGoogleClientSecret('');
      setSuccess('Google OAuth credentials updated.');
      setTimeout(() => setSuccess(''), 3000);
      await loadConfig();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTestOllama = async () => {
    setOllamaTest({ testing: true, result: null });
    try {
      const result = await admin.testOllama(
        orchestrator.options?.ollama?.endpoint,
        orchestrator.options?.ollama?.model
      );
      setOllamaTest({ testing: false, result });
    } catch (err: any) {
      setOllamaTest({ testing: false, result: { ok: false, message: err.message, durationMs: 0 } });
    }
  };

  if (!config) {
    return <div className="text-gray-400">Loading system configuration...</div>;
  }

  const selectClass = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white';
  const inputClass = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full';
  const labelClass = 'text-sm text-gray-500';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">System Configuration</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="text-green-600 bg-green-50 p-3 rounded-lg mb-4">{success}</div>}

      <div className="space-y-6">
        {/* General (read-only) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">General</h2>
          <dl className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <dt className="text-gray-500">Version</dt>
              <dd className="font-medium">{config.version}</dd>
            </div>
            <div className="flex items-center justify-between text-sm">
              <dt className="text-gray-500">Database</dt>
              <dd className="font-medium capitalize">{config.database.type}</dd>
            </div>
          </dl>
        </div>

        {/* AI Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">AI Settings</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Default Model</label>
              <select className={selectClass} value={executor.default} onChange={e => setExecutor({ ...executor, default: e.target.value })}>
                {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Simple Tasks</label>
              <select className={selectClass} value={executor.simple} onChange={e => setExecutor({ ...executor, simple: e.target.value })}>
                {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Complex Tasks</label>
              <select className={selectClass} value={executor.complex} onChange={e => setExecutor({ ...executor, complex: e.target.value })}>
                {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>API Key</label>
                <span className={`text-xs ${config.ai.hasApiKey ? 'text-green-600' : 'text-red-500'}`}>
                  {config.ai.hasApiKey ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className={inputClass}
                />
                <button
                  onClick={handleUpdateApiKey}
                  disabled={!apiKey}
                  className="px-4 py-1.5 text-sm bg-hive-500 text-white rounded-lg hover:bg-hive-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Update Key
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Orchestrator */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Orchestrator</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Provider</label>
              <select className={selectClass} value={orchestrator.provider} onChange={e => setOrchestrator({ ...orchestrator, provider: e.target.value })}>
                {ORCHESTRATOR_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Fallback</label>
              <select
                className={selectClass}
                value={orchestrator.fallback || ''}
                onChange={e => setOrchestrator({ ...orchestrator, fallback: e.target.value || null })}
              >
                <option value="">None</option>
                {ORCHESTRATOR_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {(orchestrator.provider === 'ollama' || orchestrator.fallback === 'ollama') && (
              <>
                <div>
                  <label className={labelClass}>Ollama Endpoint</label>
                  <input
                    className={inputClass + ' mt-1'}
                    value={orchestrator.options?.ollama?.endpoint || 'http://localhost:11434'}
                    onChange={e => setOrchestrator({
                      ...orchestrator,
                      options: { ...orchestrator.options, ollama: { ...orchestrator.options?.ollama, endpoint: e.target.value, model: orchestrator.options?.ollama?.model || 'llama3.2' } }
                    })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Ollama Model</label>
                  <input
                    className={inputClass + ' mt-1'}
                    value={orchestrator.options?.ollama?.model || 'llama3.2'}
                    onChange={e => setOrchestrator({
                      ...orchestrator,
                      options: { ...orchestrator.options, ollama: { ...orchestrator.options?.ollama, endpoint: orchestrator.options?.ollama?.endpoint || 'http://localhost:11434', model: e.target.value } }
                    })}
                  />
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <button
                    onClick={handleTestOllama}
                    disabled={ollamaTest.testing}
                    className="px-4 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
                  >
                    {ollamaTest.testing ? 'Testing...' : 'Test Ollama Connection'}
                  </button>
                  {ollamaTest.result && (
                    <div className={`mt-2 text-sm p-2 rounded ${ollamaTest.result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {ollamaTest.result.message}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Channels */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Channels</h2>
          <div className="space-y-4">
            {/* WhatsApp */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">WhatsApp</label>
                <button
                  onClick={() => setChannelsWa({ ...channelsWa, enabled: !channelsWa.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    channelsWa.enabled ? 'bg-hive-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    channelsWa.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {channelsWa.enabled && (
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input
                    className={inputClass + ' mt-1'}
                    placeholder="+1234567890"
                    value={channelsWa.number}
                    onChange={e => setChannelsWa({ ...channelsWa, number: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Telegram */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Telegram</label>
                <button
                  onClick={() => setChannelsTg({ ...channelsTg, enabled: !channelsTg.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    channelsTg.enabled ? 'bg-hive-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    channelsTg.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              {channelsTg.enabled && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelClass}>Bot Token</label>
                    <span className={`text-xs ${config.channels.telegram.hasBotToken ? 'text-green-600' : 'text-red-500'}`}>
                      {config.channels.telegram.hasBotToken ? 'Configured' : 'Not set'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="123456:ABC-DEF..."
                      value={tgToken}
                      onChange={e => setTgToken(e.target.value)}
                      className={inputClass}
                    />
                    <button
                      onClick={handleUpdateTgToken}
                      disabled={!tgToken}
                      className="px-4 py-1.5 text-sm bg-hive-500 text-white rounded-lg hover:bg-hive-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Update Token
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Email (Brevo) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Email (Brevo)</h2>
          <p className="text-xs text-gray-400 mb-3">
            Configure Brevo to enable the send_email tool in conversations.
          </p>
          <div className="space-y-3">
            <div className="border-b border-gray-100 pb-3">
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>API Key</label>
                <span className={`text-xs ${config.brevo?.hasApiKey ? 'text-green-600' : 'text-red-500'}`}>
                  {config.brevo?.hasApiKey ? 'Configured' : 'Not set'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="xkeysib-..."
                  value={brevoApiKey}
                  onChange={e => setBrevoApiKey(e.target.value)}
                  className={inputClass}
                />
                <button
                  onClick={handleUpdateBrevoKey}
                  disabled={!brevoApiKey}
                  className="px-4 py-1.5 text-sm bg-hive-500 text-white rounded-lg hover:bg-hive-600 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Update Key
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Default Sender Name</label>
              <input
                className={inputClass + ' mt-1'}
                placeholder="Hive Assistant"
                value={brevo.defaultSenderName}
                onChange={e => setBrevo({ ...brevo, defaultSenderName: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Default Sender Email</label>
              <input
                className={inputClass + ' mt-1'}
                placeholder="noreply@yourdomain.com"
                value={brevo.defaultSenderEmail}
                onChange={e => setBrevo({ ...brevo, defaultSenderEmail: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-400">The sender email must be verified in your Brevo account.</p>
          </div>
        </div>

        {/* Google (OAuth) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Google (OAuth)</h2>
          <p className="text-xs text-gray-400 mb-3">
            Configure Google OAuth to let users connect their Calendar and Gmail via Settings &gt; Integrations.
          </p>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>Client ID</label>
                <span className={`text-xs ${config.google?.hasClientId ? 'text-green-600' : 'text-red-500'}`}>
                  {config.google?.hasClientId ? 'Configured' : 'Not set'}
                </span>
              </div>
              <input
                type="password"
                placeholder="xxxx.apps.googleusercontent.com"
                value={googleClientId}
                onChange={e => setGoogleClientId(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass}>Client Secret</label>
                <span className={`text-xs ${config.google?.hasClientSecret ? 'text-green-600' : 'text-red-500'}`}>
                  {config.google?.hasClientSecret ? 'Configured' : 'Not set'}
                </span>
              </div>
              <input
                type="password"
                placeholder="GOCSPX-..."
                value={googleClientSecret}
                onChange={e => setGoogleClientSecret(e.target.value)}
                className={inputClass}
              />
            </div>
            <button
              onClick={handleUpdateGoogleCreds}
              disabled={!googleClientId && !googleClientSecret}
              className="px-4 py-1.5 text-sm bg-hive-500 text-white rounded-lg hover:bg-hive-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Update Google Credentials
            </button>
            <p className="text-xs text-gray-400">
              Create credentials in the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-hive-500 underline">Google Cloud Console</a>.
              Set the authorized redirect URI to <code className="bg-gray-100 px-1 rounded text-xs">https://yourdomain/api/integrations/google/callback</code>.
            </p>
          </div>
        </div>

        {/* Web Dashboard */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Web Dashboard</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Port</label>
              <input
                type="number"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 text-right"
                value={web.port}
                onChange={e => setWeb({ ...web, port: parseInt(e.target.value) || 3000 })}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Host</label>
              <input
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 text-right"
                value={web.host}
                onChange={e => setWeb({ ...web, host: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-400">Changes to port or host require a server restart.</p>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">User Info</h2>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass + ' mt-1'} value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Preferred Name</label>
              <input className={inputClass + ' mt-1'} value={user.preferredName} onChange={e => setUser({ ...user, preferredName: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Timezone</label>
              <input className={inputClass + ' mt-1'} placeholder="America/New_York" value={user.timezone} onChange={e => setUser({ ...user, timezone: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Debug Logging */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Debug Logging</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Enable Debug Logging</label>
              <button
                onClick={() => setDebug({ ...debug, enabled: !debug.enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  debug.enabled ? 'bg-hive-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  debug.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Retention (days)</label>
              <input
                type="number"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24 text-right"
                value={debug.retentionDays}
                onChange={e => setDebug({ ...debug, retentionDays: parseInt(e.target.value) || 30 })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-hive-500 text-white rounded-lg hover:bg-hive-600 disabled:opacity-50 font-medium"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <span className="text-sm text-gray-400">Credential fields have their own update buttons above.</span>
      </div>
    </div>
  );
}
