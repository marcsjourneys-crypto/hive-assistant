import { useState, useEffect } from 'react';
import { tools, ToolInfo } from '../api';

const TOOL_HINTS: Record<string, string> = {
  send_email: 'Ask Astra to email someone and she\'ll use this tool automatically.',
  manage_reminders: 'Say "remind me to..." or "what are my reminders?" in chat.',
  run_script: 'Ask Astra to run a script by name, e.g. "run csv-diff on my file".',
  fetch_rss: 'Ask Astra to check your RSS feeds or get news updates.',
  fetch_url: 'Ask Astra to read a web page or fetch data from a URL.',
};

const CATEGORY_ICONS: Record<string, string> = {
  Communication: '📧',
  Data: '📊',
  Utilities: '🔧',
  Other: '📦',
};

export default function ToolsPage() {
  const [toolList, setToolList] = useState<ToolInfo[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tools.list()
      .then(setToolList)
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500">Loading tools...</div>;
  }

  if (error) {
    return <div className="text-red-500">Failed to load tools: {error}</div>;
  }

  // Group tools by category
  const grouped: Record<string, ToolInfo[]> = {};
  for (const tool of toolList) {
    const cat = tool.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tool);
  }

  const categoryOrder = ['Communication', 'Data', 'Utilities', 'Other'];
  const sortedCategories = categoryOrder.filter(c => grouped[c]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
        <p className="text-gray-500 mt-1">
          These are the tools your AI assistant can use during conversations.
          Just ask naturally and she'll decide when to use them.
        </p>
      </div>

      <div className="space-y-8">
        {sortedCategories.map(category => (
          <div key={category}>
            <h2 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span>{CATEGORY_ICONS[category] || '📦'}</span>
              {category}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {grouped[category].map(tool => (
                <div
                  key={tool.name}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <h3 className="font-mono text-sm font-semibold text-gray-900">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{tool.description}</p>
                  {TOOL_HINTS[tool.name] && (
                    <p className="text-xs text-gray-400 mt-2 italic">
                      {TOOL_HINTS[tool.name]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
