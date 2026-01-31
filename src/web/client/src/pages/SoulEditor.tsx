import { useState, useEffect } from 'react';
import { soul, SoulConfig, VoicePreset } from '../api';

export default function SoulEditor() {
  const [config, setConfig] = useState<SoulConfig>({ name: '', voice: 'friendly', traits: [] });
  const [presets, setPresets] = useState<VoicePreset[]>([]);
  const [traitsText, setTraitsText] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [soulData, presetsData] = await Promise.all([
        soul.get(),
        soul.presets(),
      ]);
      setConfig(soulData);
      setTraitsText(soulData.traits.join('\n'));
      setPresets(presetsData);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const traits = traitsText.split('\n').map(t => t.trim()).filter(Boolean);
      const updated = await soul.update({ ...config, traits });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      const traits = traitsText.split('\n').map(t => t.trim()).filter(Boolean);
      const result = await soul.preview({ ...config, traits });
      setPreview(result.preview);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const selectedPreset = presets.find(p => p.id === config.voice);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Personality Settings</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assistant Name</label>
          <input
            type="text"
            value={config.name}
            onChange={e => setConfig({ ...config, name: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
            placeholder="e.g. Hive, Jarvis, Friday"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Voice Preset</label>
          <select
            value={config.voice}
            onChange={e => setConfig({ ...config, voice: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
          >
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedPreset && (
            <p className="mt-2 text-sm text-gray-500 whitespace-pre-line">{selectedPreset.description}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Custom Traits</label>
          <textarea
            value={traitsText}
            onChange={e => setTraitsText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
            placeholder={"One trait per line, e.g.\nAlways suggest actionable next steps\nUse bullet points for lists"}
          />
          <p className="mt-1 text-xs text-gray-400">One trait per line</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Custom Instructions</label>
          <textarea
            value={config.customInstructions || ''}
            onChange={e => setConfig({ ...config, customInstructions: e.target.value || undefined })}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-hive-500 focus:border-transparent outline-none"
            placeholder="Additional instructions for your assistant..."
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-hive-500 hover:bg-hive-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={handlePreview}
            className="px-6 py-2 border border-gray-300 hover:bg-gray-50 font-medium rounded-lg transition-colors"
          >
            Preview
          </button>

          {saved && <span className="text-green-600 text-sm">Saved!</span>}
        </div>
      </form>

      {preview && (
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Preview Response</h3>
          <blockquote className="text-gray-700 italic">"{preview}"</blockquote>
        </div>
      )}
    </div>
  );
}
