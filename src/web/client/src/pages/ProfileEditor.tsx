import { useState, useEffect } from 'react';
import { profile, ProfileConfig } from '../api';

export default function ProfileEditor() {
  const [config, setConfig] = useState<ProfileConfig>({
    name: '', preferredName: '', timezone: '', bio: '', sections: {}
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await profile.get();
      setConfig(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const updated = await profile.update(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={config.name}
              onChange={e => setConfig({ ...config, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Name</label>
            <input
              type="text"
              value={config.preferredName}
              onChange={e => setConfig({ ...config, preferredName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
              placeholder="What should the assistant call you?"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <input
            type="text"
            value={config.timezone}
            onChange={e => setConfig({ ...config, timezone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
            placeholder="e.g. America/New_York"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <textarea
            value={config.bio}
            onChange={e => setConfig({ ...config, bio: e.target.value })}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
            placeholder="Tell the assistant about yourself. Include things like your role, projects, preferences..."
          />
          <p className="mt-1 text-xs text-gray-400">
            This helps the assistant personalize responses to you.
          </p>
        </div>

        {/* Sections */}
        {Object.keys(config.sections).length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Sections</h3>
            <div className="space-y-4">
              {Object.entries(config.sections).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm text-gray-600 mb-1 capitalize">
                    {key.replace(/_/g, ' ')}
                  </label>
                  <textarea
                    value={value}
                    onChange={e => setConfig({
                      ...config,
                      sections: { ...config.sections, [key]: e.target.value }
                    })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-hive-500 hover:bg-hive-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span className="text-green-600 text-sm">Saved!</span>}
        </div>
      </form>
    </div>
  );
}
