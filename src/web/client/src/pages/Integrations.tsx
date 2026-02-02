import { useState, useEffect } from 'react';
import { integrations } from '../api';

export default function IntegrationsPage() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [gmailAuthorized, setGmailAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
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
    } finally {
      setLoading(false);
    }
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
        not_configured: 'Google OAuth is not configured. Ask an admin to set it up.',
        token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
        no_refresh_token: 'No refresh token received. Please try again and ensure you grant offline access.',
        callback_failed: 'OAuth callback failed. Please try again.',
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

        {/* Placeholder for future integrations */}
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-6 text-center">
          <p className="text-gray-400 text-sm">More integrations coming soon (GitHub, Slack, etc.)</p>
        </div>
      </div>
    </div>
  );
}
