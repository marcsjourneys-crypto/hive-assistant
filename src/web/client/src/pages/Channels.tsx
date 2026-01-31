import { useState, useEffect } from 'react';
import { channels, ChannelStatus } from '../api';

export default function Channels() {
  const [data, setData] = useState<ChannelStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const status = await channels.status();
      setData(status);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const channelMeta: Record<string, { label: string; description: string; icon: string }> = {
    cli: {
      label: 'CLI',
      description: 'Command-line interface. Always available.',
      icon: '💻',
    },
    whatsapp: {
      label: 'WhatsApp',
      description: 'Connect via QR code to send/receive WhatsApp messages.',
      icon: '📱',
    },
    telegram: {
      label: 'Telegram',
      description: 'Connect via Telegram Bot API with a bot token from @BotFather.',
      icon: '✈️',
    },
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Channels</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      {!data ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(data).map(([key, info]) => {
            const meta = channelMeta[key];
            if (!meta) return null;
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      <h3 className="font-medium">{meta.label}</h3>
                      <p className="text-sm text-gray-500 mt-1">{meta.description}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    info.enabled
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {info.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-sm text-gray-400">
        Channel configuration is managed via <code className="bg-gray-100 px-1 py-0.5 rounded">hive channels</code> CLI command.
      </div>
    </div>
  );
}
