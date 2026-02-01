import { useState, useEffect } from 'react';
import { credentials, CredentialInfo } from '../api';

interface CredentialForm {
  name: string;
  service: string;
  value: string;
}

const emptyForm: CredentialForm = { name: '', service: '', value: '' };

const servicePresets = [
  'google_sheets', 'gmail', 'jira', 'slack', 'github',
  'notion', 'linear', 'stripe', 'twilio', 'openai', 'custom'
];

export default function CredentialsPage() {
  const [credList, setCredList] = useState<CredentialInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CredentialForm>(emptyForm);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const data = await credentials.list();
      setCredList(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.service.trim()) { setError('Service is required.'); return; }
    if (!form.value.trim()) { setError('Value is required.'); return; }

    setSaving(true);
    setError('');
    try {
      await credentials.create(form);
      setShowForm(false);
      setForm(emptyForm);
      await loadCredentials();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await credentials.delete(id);
      setDeleting(null);
      await loadCredentials();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Credentials</h1>
          <p className="text-sm text-gray-500 mt-1">
            Securely store API keys and tokens for use in scripts. Values are encrypted at rest.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError(''); }}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
          >
            + Add Credential
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
          <h2 className="text-lg font-semibold mb-4">Add Credential</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder='e.g., "My Google API Key"'
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
                <select
                  value={servicePresets.includes(form.service) ? form.service : 'custom'}
                  onChange={e => setForm({ ...form, service: e.target.value === 'custom' ? '' : e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                >
                  {servicePresets.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {form.service === '' && (
                  <input
                    type="text"
                    value={form.service}
                    onChange={e => setForm({ ...form, service: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                    placeholder="Custom service name"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value
                <span className="text-gray-400 font-normal ml-1">(API key, token, or JSON credentials)</span>
              </label>
              <textarea
                value={form.value}
                onChange={e => setForm({ ...form, value: e.target.value })}
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="sk-..."
                spellCheck={false}
              />
              <p className="text-xs text-gray-400 mt-1">
                This value will be encrypted before storage. It will never be displayed in the UI.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Encrypting...' : 'Store Credential'}
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
      {credList.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No credentials stored yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Store API keys and tokens here. They'll be encrypted and available for use in your scripts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {credList.map(cred => (
            <div key={cred.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{cred.name}</h3>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                      {cred.service}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Added {new Date(cred.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <span className="text-xs text-gray-400">***encrypted***</span>
                  {deleting === cred.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(cred.id)}
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
                      onClick={() => setDeleting(cred.id)}
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
