import { useState, useEffect } from 'react';
import { admin, SystemConfig } from '../../api';

export default function System() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await admin.system();
      setConfig(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!config) {
    return <div className="text-gray-400">Loading system configuration...</div>;
  }

  const sections = [
    {
      title: 'General',
      items: [
        { label: 'Version', value: config.version },
        { label: 'Database', value: config.database.type },
      ]
    },
    {
      title: 'AI',
      items: [
        { label: 'Provider', value: config.ai.provider },
        { label: 'Default Model', value: config.ai.executor.default },
        { label: 'Simple Tasks', value: config.ai.executor.simple },
        { label: 'Complex Tasks', value: config.ai.executor.complex },
      ]
    },
    {
      title: 'Orchestrator',
      items: [
        { label: 'Provider', value: config.orchestrator.provider },
        { label: 'Fallback', value: config.orchestrator.fallback || 'None' },
      ]
    },
    {
      title: 'Channels',
      items: [
        { label: 'WhatsApp', value: config.channels.whatsapp.enabled ? 'Enabled' : 'Disabled' },
        { label: 'Telegram', value: config.channels.telegram.enabled ? 'Enabled' : 'Disabled' },
      ]
    },
    {
      title: 'Web Dashboard',
      items: [
        { label: 'Enabled', value: config.web?.enabled ? 'Yes' : 'No' },
        { label: 'Port', value: String(config.web?.port || 3000) },
      ]
    },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">System Configuration</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <div className="space-y-6">
        {sections.map(section => (
          <div key={section.title} className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">{section.title}</h2>
            <dl className="space-y-2">
              {section.items.map(item => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <dt className="text-gray-500">{item.label}</dt>
                  <dd className="font-medium capitalize">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-6 text-sm text-gray-400">
        System configuration is managed via <code className="bg-gray-100 px-1 py-0.5 rounded">hive config</code> CLI command.
      </div>
    </div>
  );
}
