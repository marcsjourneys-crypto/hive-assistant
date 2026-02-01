import { useState, useEffect } from 'react';
import { channelIdentities, ChannelIdentityInfo } from '../api';

interface IdentityForm {
  channel: string;
  channelUserId: string;
  label: string;
}

const emptyForm: IdentityForm = { channel: 'telegram', channelUserId: '', label: '' };

const channelOptions = [
  { value: 'telegram', label: 'Telegram' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

function maskId(id: string): string {
  if (id.length <= 4) return id;
  return id.slice(0, 4) + '...' + id.slice(-2);
}

export default function ChannelIdentitiesPage() {
  const [identities, setIdentities] = useState<ChannelIdentityInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<IdentityForm>(emptyForm);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadIdentities();
  }, []);

  const loadIdentities = async () => {
    try {
      const data = await channelIdentities.list();
      setIdentities(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreate = async () => {
    if (!form.channelUserId.trim()) { setError('Chat ID is required.'); return; }

    setSaving(true);
    setError('');
    try {
      await channelIdentities.create({
        channel: form.channel,
        channelUserId: form.channelUserId.trim(),
        label: form.label.trim() || undefined,
      });
      setShowForm(false);
      setForm(emptyForm);
      await loadIdentities();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await channelIdentities.delete(id);
      setDeleting(null);
      await loadIdentities();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Channel Identities</h1>
          <p className="text-sm text-gray-500 mt-1">
            Link your messaging accounts so workflows can send you notifications automatically.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError(''); }}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
          >
            + Link Account
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Link Account</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
                <select
                  value={form.channel}
                  onChange={e => setForm({ ...form, channel: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                >
                  {channelOptions.map(ch => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder='e.g., "My Telegram"'
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chat ID</label>
              <input
                type="text"
                value={form.channelUserId}
                onChange={e => setForm({ ...form, channelUserId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder={form.channel === 'telegram' ? 'e.g., 123456789' : 'e.g., 15551234567'}
              />
              {form.channel === 'telegram' && (
                <p className="text-xs text-gray-400 mt-1">
                  Get your Telegram chat ID by messaging <span className="font-mono">@userinfobot</span> on Telegram.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Linking...' : 'Link Account'}
              </button>
              <button
                onClick={() => { setShowForm(false); setForm(emptyForm); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {identities.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No linked accounts yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Link your Telegram or WhatsApp account so workflow notifications find you automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {identities.map(identity => (
            <div key={identity.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{identity.label || identity.channel}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      identity.channel === 'telegram'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {identity.channel}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 font-mono">
                    ID: {maskId(identity.channelUserId)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Linked {new Date(identity.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {deleting === identity.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(identity.id)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleting(null)}
                        className="text-sm text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setDeleting(identity.id)}
                      className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
