import { useState, useEffect } from 'react';
import { integrations, admin, SupabaseDatabaseInfo } from '../api';

// Version tag for debugging deployment issues
const BUILD_VERSION = '2026-02-09-multidb-v1';

interface DatabaseFormState {
  name: string;
  url: string;
  anonKey: string;
  isEditing: boolean;
}

export default function IntegrationsPage() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [gmailAuthorized, setGmailAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Supabase state - multi-database
  const [isAdmin, setIsAdmin] = useState(false);
  const [databases, setDatabases] = useState<SupabaseDatabaseInfo[]>([]);
  const [dbForm, setDbForm] = useState<DatabaseFormState>({ name: '', url: '', anonKey: '', isEditing: false });
  const [showAddForm, setShowAddForm] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [testingDb, setTestingDb] = useState<string | null>(null);
  const [dbTestResults, setDbTestResults] = useState<Record<string, { ok: boolean; tables?: string[]; error?: string }>>({});

  useEffect(() => {
    console.log('[Integrations] BUILD_VERSION:', BUILD_VERSION);
    loadStatus();
    checkUrlParams();
  }, []);

  async function loadStatus() {
    try {
      const status = await integrations.googleStatus();
      setGoogleConnected(status.connected);
      if (status.connected) {
        try {
          const gmailStatus = await integrations.gmailStatus();
          setGmailAuthorized(gmailStatus.gmailAuthorized);
        } catch {
          setGmailAuthorized(false);
        }
      }
    } catch {
      // Google may not be configured — show as disconnected
    }

    // Load Supabase databases for admins
    try {
      console.log('[Integrations] Calling admin.listSupabaseDatabases()...');
      const dbList = await admin.listSupabaseDatabases();
      console.log('[Integrations] listSupabaseDatabases success:', dbList);
      setIsAdmin(true);
      setDatabases(dbList);
    } catch (err) {
      console.log('[Integrations] listSupabaseDatabases failed:', err);
      // Fallback: try getSystem to check if user is admin
      try {
        await admin.getSystem();
        setIsAdmin(true);
        setDatabases([]);
      } catch {
        setIsAdmin(false);
      }
    }

    setLoading(false);
  }

  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'google_connected') {
      setMessage({ type: 'success', text: 'Google connected successfully!' });
      setGoogleConnected(true);
      setGmailAuthorized(true);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    const error = params.get('error');
    if (error) {
      const errorMessages: Record<string, string> = {
        google_denied: 'Google access was denied.',
        missing_params: 'OAuth callback missing required parameters.',
        invalid_state: 'Invalid OAuth state. Please try again.',
        expired_state: 'OAuth session expired. Please try again.',
        not_configured: 'Google OAuth is not configured. Set google.clientId and google.clientSecret in your Hive config.',
        token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
        no_refresh_token: 'No refresh token received. Please try again and ensure you grant offline access.',
        callback_failed: 'OAuth callback failed. Please try again.',
        connect_failed: 'Failed to start OAuth flow. Please try again.',
      };
      setMessage({ type: 'error', text: errorMessages[error] || `Connection failed: ${error}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await integrations.googleDisconnect();
      setGoogleConnected(false);
      setGmailAuthorized(false);
      setMessage({ type: 'success', text: 'Google disconnected.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect' });
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Integrations</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Integrations</h1>
      <p className="text-gray-500 mb-6">Connect third-party services to enable additional tools for your assistant.</p>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="float-right text-current opacity-60 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Google (Calendar + Gmail) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-semibold">Google</h3>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  googleConnected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {googleConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Access your Google Calendar and Gmail through your assistant.
                {!googleConnected && ' Connect your Google account to get started.'}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              {googleConnected ? (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : (
                <a
                  href="/api/integrations/google/connect"
                  className="px-4 py-2 text-sm text-white bg-hive-500 rounded-lg hover:bg-hive-600 inline-block"
                >
                  Connect
                </a>
              )}
            </div>
          </div>

          {googleConnected && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              {/* Service sub-status */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-gray-600">Calendar</span>
                  <span className="text-xs text-green-600 font-medium">Connected</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {gmailAuthorized ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-gray-600">Gmail</span>
                      <span className="text-xs text-green-600 font-medium">Connected</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-gray-600">Gmail</span>
                      <span className="text-xs text-amber-600 font-medium">Requires re-authorization</span>
                      <a
                        href="/api/integrations/google/connect"
                        className="text-xs text-hive-600 hover:text-hive-700 underline ml-1"
                      >
                        Re-authorize
                      </a>
                    </>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Your assistant can use the{' '}
                <code className="bg-gray-100 px-1 rounded">manage_calendar</code>
                {gmailAuthorized && (
                  <> and <code className="bg-gray-100 px-1 rounded">manage_email</code></>
                )}
                {' '}tool{gmailAuthorized ? 's' : ''} to interact with your Google services.
              </p>
            </div>
          )}
        </div>

        {/* Supabase Databases (Admin only) */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold">Supabase Databases</h3>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    databases.length > 0
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {databases.length > 0 ? `${databases.length} configured` : 'Not configured'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                    Admin
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  Connect Supabase databases for data queries in workflows and chat.
                  You can configure multiple databases (e.g., sales_db, inventory_db).
                </p>
              </div>
              {!showAddForm && (
                <button
                  onClick={() => {
                    setDbForm({ name: '', url: '', anonKey: '', isEditing: false });
                    setShowAddForm(true);
                  }}
                  className="px-4 py-2 text-sm text-white bg-hive-500 rounded-lg hover:bg-hive-600"
                >
                  Add Database
                </button>
              )}
            </div>

            {/* Database list */}
            {databases.length > 0 && (
              <div className="space-y-3 mb-4">
                {databases.map((db) => (
                  <div key={db.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${db.hasUrl && db.hasAnonKey ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div>
                        <span className="font-medium text-sm">{db.name}</span>
                        {db.name === 'default' && (
                          <span className="ml-2 text-xs text-gray-400">(default)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {dbTestResults[db.name] && (
                        <span className={`text-xs ${dbTestResults[db.name].ok ? 'text-green-600' : 'text-red-600'}`}>
                          {dbTestResults[db.name].ok ? `${dbTestResults[db.name].tables?.length || 0} tables` : 'Failed'}
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          setTestingDb(db.name);
                          try {
                            const result = await admin.testSupabaseDatabase(db.name);
                            setDbTestResults(prev => ({ ...prev, [db.name]: result }));
                          } catch (err: any) {
                            setDbTestResults(prev => ({ ...prev, [db.name]: { ok: false, error: err.message } }));
                          } finally {
                            setTestingDb(null);
                          }
                        }}
                        disabled={testingDb === db.name}
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                      >
                        {testingDb === db.name ? 'Testing...' : 'Test'}
                      </button>
                      <button
                        onClick={() => {
                          setDbForm({ name: db.name, url: '', anonKey: '', isEditing: true });
                          setShowAddForm(true);
                        }}
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete database "${db.name}"?`)) return;
                          try {
                            await admin.deleteSupabaseDatabase(db.name);
                            setDatabases(prev => prev.filter(d => d.name !== db.name));
                            setMessage({ type: 'success', text: `Database "${db.name}" deleted.` });
                          } catch (err: any) {
                            setMessage({ type: 'error', text: err.message });
                          }
                        }}
                        className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add/Edit form */}
            {showAddForm && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm">
                  {dbForm.isEditing ? `Update "${dbForm.name}"` : 'Add New Database'}
                </h4>

                {!dbForm.isEditing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Database Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., sales_db"
                      value={dbForm.name}
                      onChange={(e) => setDbForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-hive-500 focus:border-hive-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Use lowercase letters, numbers, and underscores only.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supabase URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://xxx.supabase.co"
                    value={dbForm.url}
                    onChange={(e) => setDbForm(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-hive-500 focus:border-hive-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Anon Key (public read-only)
                  </label>
                  <input
                    type="password"
                    placeholder="eyJ..."
                    value={dbForm.anonKey}
                    onChange={(e) => setDbForm(prev => ({ ...prev, anonKey: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-hive-500 focus:border-hive-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Use your Supabase anon key for read-only access. Never use the service role key here.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      if (!dbForm.isEditing && !dbForm.name) {
                        setMessage({ type: 'error', text: 'Database name is required' });
                        return;
                      }
                      if (!dbForm.url && !dbForm.anonKey) {
                        setMessage({ type: 'error', text: 'URL or anon key is required' });
                        return;
                      }

                      setDbSaving(true);
                      try {
                        await admin.updateSupabaseDatabase(dbForm.name, {
                          url: dbForm.url || undefined,
                          anonKey: dbForm.anonKey || undefined
                        });
                        setMessage({ type: 'success', text: `Database "${dbForm.name}" saved!` });

                        // Refresh database list
                        const dbList = await admin.listSupabaseDatabases();
                        setDatabases(dbList);

                        setShowAddForm(false);
                        setDbForm({ name: '', url: '', anonKey: '', isEditing: false });
                      } catch (err: any) {
                        setMessage({ type: 'error', text: err.message || 'Failed to save database' });
                      } finally {
                        setDbSaving(false);
                      }
                    }}
                    disabled={dbSaving}
                    className="px-4 py-2 text-sm text-white bg-hive-500 rounded-lg hover:bg-hive-600 disabled:opacity-50"
                  >
                    {dbSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setDbForm({ name: '', url: '', anonKey: '', isEditing: false });
                    }}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {databases.length > 0 && !showAddForm && (
              <p className="text-xs text-gray-400 mt-4">
                Your assistant can use the{' '}
                <code className="bg-gray-100 px-1 rounded">manage_database</code>{' '}
                tool to query your databases. Specify database name in queries or presets.
              </p>
            )}
          </div>
        )}

        {/* Placeholder for future integrations */}
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-6 text-center">
          <p className="text-gray-400 text-sm">More integrations coming soon (GitHub, Slack, etc.)</p>
        </div>

        {/* Debug: Version indicator */}
        <div className="mt-4 text-xs text-gray-300 text-right">
          Build: {BUILD_VERSION} | isAdmin: {isAdmin ? 'true' : 'false'}
        </div>
      </div>
    </div>
  );
}
