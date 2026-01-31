import { useState, useEffect } from 'react';
import { useAuth } from '../auth-context';
import { usage, channels, UsageSummary, ChannelStatus } from '../api';

export default function Dashboard() {
  const { user } = useAuth();
  const [usageData, setUsageData] = useState<UsageSummary | null>(null);
  const [channelData, setChannelData] = useState<ChannelStatus | null>(null);
  const [period, setPeriod] = useState('today');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    try {
      const [u, c] = await Promise.all([
        usage.summary(period),
        channels.status(),
      ]);
      setUsageData(u);
      setChannelData(c);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatCost = (cents: number) => `$${(cents / 100).toFixed(4)}`;
  const formatTokens = (n: number) => n.toLocaleString();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="mb-6 text-sm text-gray-500">
        Welcome back, {user?.email}
        {user?.isAdmin && (
          <span className="ml-2 px-2 py-0.5 bg-hive-100 text-hive-800 rounded text-xs font-medium">Admin</span>
        )}
      </div>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      {/* Usage Stats */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Usage</h2>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        {usageData ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Tokens In</p>
              <p className="text-2xl font-bold mt-1">{formatTokens(usageData.totalTokensIn)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Tokens Out</p>
              <p className="text-2xl font-bold mt-1">{formatTokens(usageData.totalTokensOut)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500">Cost</p>
              <p className="text-2xl font-bold mt-1">{formatCost(usageData.totalCostCents)}</p>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Loading usage data...</div>
        )}

        {usageData && Object.keys(usageData.byModel).length > 0 && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-3">By Model</h3>
            <div className="space-y-2">
              {Object.entries(usageData.byModel).map(([model, data]) => (
                <div key={model} className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize">{model}</span>
                  <span className="text-gray-500">
                    {formatTokens(data.tokensIn + data.tokensOut)} tokens &middot; {formatCost(data.costCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Channel Status */}
      {channelData && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Channels</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(channelData).map(([name, info]) => (
              <div key={name} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    info.enabled
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {info.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
