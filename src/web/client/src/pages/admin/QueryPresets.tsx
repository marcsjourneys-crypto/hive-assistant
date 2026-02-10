import { useState, useEffect } from 'react';
import { admin, QueryPreset, CreatePresetInput, UpdatePresetInput, SupabaseDatabaseInfo } from '../../api';

interface PresetForm {
  name: string;
  label: string;
  description: string;
  sql: string;
  databaseName: string;
}

const emptyForm: PresetForm = {
  name: '',
  label: '',
  description: '',
  sql: 'SELECT * FROM your_table LIMIT 10',
  databaseName: '',
};

export default function QueryPresets() {
  const [presets, setPresets] = useState<QueryPreset[]>([]);
  const [databases, setDatabases] = useState<SupabaseDatabaseInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editing, setEditing] = useState<string | null>(null); // preset id or 'new'
  const [form, setForm] = useState<PresetForm>(emptyForm);

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadPresets();
    loadDatabases();
  }, []);

  const loadPresets = async () => {
    try {
      const data = await admin.listPresets();
      setPresets(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadDatabases = async () => {
    try {
      const data = await admin.listSupabaseDatabases();
      setDatabases(data);
    } catch (err: any) {
      // Silently fail - databases may not be configured
      console.warn('Failed to load databases:', err.message);
    }
  };

  const startCreate = () => {
    const defaultDb = databases.length > 0 ? databases[0].name : '';
    setForm({ ...emptyForm, databaseName: defaultDb });
    setEditing('new');
    setError('');
  };

  const startEdit = (preset: QueryPreset) => {
    setForm({
      name: preset.name,
      label: preset.label,
      description: preset.description,
      sql: preset.sql,
      databaseName: preset.databaseName,
    });
    setEditing(preset.id);
    setError('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.label.trim() || !form.sql.trim()) {
      setError('Name, label, and SQL are required.');
      return;
    }

    // Validate name format (lowercase, no spaces)
    if (!/^[a-z][a-z0-9_]*$/.test(form.name)) {
      setError('Name must be lowercase, start with a letter, and contain only letters, numbers, and underscores.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        const input: CreatePresetInput = {
          name: form.name,
          label: form.label,
          description: form.description || undefined,
          sql: form.sql,
          databaseName: form.databaseName || undefined,
        };
        await admin.createPreset(input);
      } else {
        const input: UpdatePresetInput = {
          name: form.name,
          label: form.label,
          description: form.description || undefined,
          sql: form.sql,
          databaseName: form.databaseName || undefined,
        };
        await admin.updatePreset(editing!, input);
      }
      setEditing(null);
      setForm(emptyForm);
      await loadPresets();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await admin.deletePreset(id);
      setDeleting(null);
      if (editing === id) {
        setEditing(null);
        setForm(emptyForm);
      }
      await loadPresets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggle = async (id: string) => {
    setError('');
    try {
      await admin.togglePreset(id);
      await loadPresets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const truncateSql = (sql: string, maxLen: number = 60) => {
    const firstLine = sql.split('\n')[0].trim();
    if (firstLine.length <= maxLen) return firstLine;
    return firstLine.substring(0, maxLen) + '...';
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Query Presets</h1>
        {!editing && (
          <button
            onClick={startCreate}
            disabled={databases.length === 0}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={databases.length === 0 ? 'Configure a database first in Integrations' : undefined}
          >
            + New Preset
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {databases.length === 0 && !editing && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            No Supabase databases configured. Go to{' '}
            <a href="/settings/integrations" className="underline font-medium">Integrations</a>
            {' '}to add a database connection first.
          </p>
        </div>
      )}

      {/* Editor Panel */}
      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editing === 'new' ? 'Create Query Preset' : 'Edit Query Preset'}
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-gray-400 font-normal">(identifier)</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent font-mono"
                  placeholder="e.g., todays_sales"
                />
                <p className="text-xs text-gray-400 mt-1">Lowercase, underscores allowed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label <span className="text-gray-400 font-normal">(display name)</span>
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder="e.g., Today's Sales"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
                <select
                  value={form.databaseName}
                  onChange={e => setForm({ ...form, databaseName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                >
                  {databases.map(db => (
                    <option key={db.name} value={db.name}>{db.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SQL Query
                <span className="text-gray-400 font-normal ml-1">(SELECT only)</span>
              </label>
              <textarea
                value={form.sql}
                onChange={e => setForm({ ...form, sql: e.target.value })}
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent leading-relaxed"
                spellCheck={false}
                placeholder="SELECT * FROM your_table WHERE created_at >= CURRENT_DATE"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : editing === 'new' ? 'Create' : 'Save Changes'}
              </button>
              <button
                onClick={cancelEdit}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presets List */}
      {presets.length === 0 && !editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No query presets yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Create presets to save commonly-used database queries. Users can then ask the assistant to "run the {'{preset_name}'} query".
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {presets.map(preset => (
            <div
              key={preset.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(preset.id)}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        preset.isActive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      title={preset.isActive ? 'Active - click to deactivate' : 'Inactive - click to activate'}
                    />
                    <h3 className="font-medium font-mono">{preset.name}</h3>
                    <span className="text-sm text-gray-500">"{preset.label}"</span>
                  </div>
                  {preset.description && (
                    <p className="text-sm text-gray-500 mt-1 ml-5">{preset.description}</p>
                  )}
                  <code className="block text-xs text-gray-400 mt-2 ml-5 bg-gray-50 px-2 py-1 rounded">
                    {truncateSql(preset.sql)}
                  </code>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                    {preset.databaseName}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    preset.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {preset.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => startEdit(preset)}
                    className="text-sm text-gray-500 hover:text-hive-600 transition-colors"
                  >
                    Edit
                  </button>
                  {deleting === preset.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(preset.id)}
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
                      onClick={() => setDeleting(preset.id)}
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
