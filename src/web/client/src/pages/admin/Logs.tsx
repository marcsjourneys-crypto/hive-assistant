import { useState, useEffect } from 'react';
import { logs, DebugLogSummary, DebugLogDetail, LogsStatus } from '../../api';

export default function Logs() {
  const [status, setStatus] = useState<LogsStatus | null>(null);
  const [logList, setLogList] = useState<DebugLogSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [channelFilter, setChannelFilter] = useState('');
  const [intentFilter, setIntentFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DebugLogDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const limit = 50;

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [offset, channelFilter, intentFilter]);

  const loadStatus = async () => {
    try {
      const data = await logs.status();
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const filters: { channel?: string; intent?: string; limit: number; offset: number } = { limit, offset };
      if (channelFilter) filters.channel = channelFilter;
      if (intentFilter) filters.intent = intentFilter;
      const data = await logs.list(filters);
      setLogList(data.logs);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleEnabled = async () => {
    if (!status) return;
    try {
      const result = await logs.toggle(!status.enabled);
      setStatus({ ...status, enabled: result.enabled });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const viewDetail = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    try {
      const data = await logs.get(id);
      setDetail(data);
      setExpandedId(id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Debug Logs</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      {/* Toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Debug Logging</h2>
            <p className="text-sm text-gray-500 mt-1">
              {status?.enabled
                ? `Enabled - ${status.totalLogs} log entries recorded`
                : 'Disabled - enable to capture what is sent to the AI model'}
            </p>
          </div>
          <button
            onClick={toggleEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              status?.enabled ? 'bg-hive-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                status?.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={channelFilter}
          onChange={e => { setChannelFilter(e.target.value); setOffset(0); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All Channels</option>
          <option value="telegram">Telegram</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="cli">CLI</option>
        </select>

        <select
          value={intentFilter}
          onChange={e => { setIntentFilter(e.target.value); setOffset(0); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All Intents</option>
          <option value="greeting">Greeting</option>
          <option value="conversation">Conversation</option>
          <option value="personal">Personal</option>
          <option value="briefing">Briefing</option>
          <option value="task_query">Task Query</option>
          <option value="code">Code</option>
          <option value="analysis">Analysis</option>
          <option value="creative">Creative</option>
          <option value="file_operation">File Operation</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Time</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Channel</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Intent</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Model</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Tokens</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Cost</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Duration</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logList.map(log => (
              <>
                <tr
                  key={log.id}
                  onClick={() => viewDetail(log.id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-gray-600">{formatTime(log.createdAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="capitalize">{log.channel}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{log.intent}</span>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{log.actualModel || log.suggestedModel}</td>
                  <td className="px-4 py-3 text-xs text-right font-mono">{log.tokensIn + log.tokensOut}</td>
                  <td className="px-4 py-3 text-xs text-right font-mono">${log.costCents.toFixed(3)}</td>
                  <td className="px-4 py-3 text-xs text-right font-mono">{log.durationMs}ms</td>
                  <td className="px-4 py-3 text-xs text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${log.success ? 'bg-green-500' : 'bg-red-500'}`} />
                  </td>
                </tr>
                {expandedId === log.id && detail && (
                  <tr key={`${log.id}-detail`}>
                    <td colSpan={8} className="px-4 py-4 bg-gray-50">
                      <div className="space-y-4">
                        {/* User message */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">User Message</h4>
                          <p className="text-sm bg-white rounded p-3 border border-gray-200">{detail.userMessage}</p>
                        </div>

                        {/* Routing decision */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Routing Decision</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Intent:</span> <span className="font-medium">{detail.intent}</span>
                            </div>
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Complexity:</span> <span className="font-medium">{detail.complexity}</span>
                            </div>
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Model:</span> <span className="font-medium">{detail.suggestedModel}</span>
                            </div>
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Personality:</span> <span className="font-medium">{detail.personalityLevel}</span>
                            </div>
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Include Bio:</span> <span className="font-medium">{detail.includeBio ? 'Yes' : 'No'}</span>
                            </div>
                            {detail.selectedSkill && (
                              <div className="bg-white rounded p-2 border border-gray-200">
                                <span className="text-gray-500">Skill:</span> <span className="font-medium">{detail.selectedSkill}</span>
                              </div>
                            )}
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Est. Tokens:</span> <span className="font-medium">{detail.estimatedTokens}</span>
                            </div>
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="text-gray-500">Saved:</span> <span className="font-medium">{detail.tokensSaved}</span>
                            </div>
                          </div>
                        </div>

                        {/* System prompt */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">System Prompt</h4>
                          <pre className="text-xs bg-white rounded p-3 border border-gray-200 max-h-48 overflow-auto whitespace-pre-wrap">
                            {detail.systemPrompt}
                          </pre>
                        </div>

                        {/* Messages sent */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Messages Sent to Model</h4>
                          <pre className="text-xs bg-white rounded p-3 border border-gray-200 max-h-48 overflow-auto whitespace-pre-wrap">
                            {JSON.stringify(JSON.parse(detail.messagesJson || '[]'), null, 2)}
                          </pre>
                        </div>

                        {/* Response */}
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Response</h4>
                          <pre className="text-xs bg-white rounded p-3 border border-gray-200 max-h-48 overflow-auto whitespace-pre-wrap">
                            {detail.responseText}
                          </pre>
                        </div>

                        {detail.errorMessage && (
                          <div>
                            <h4 className="text-xs font-semibold text-red-500 uppercase mb-1">Error</h4>
                            <p className="text-sm text-red-600 bg-red-50 rounded p-3 border border-red-200">{detail.errorMessage}</p>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {logList.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            {loading ? 'Loading...' : 'No debug logs found. Enable logging and send a message to start capturing.'}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setOffset(offset + limit)}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
