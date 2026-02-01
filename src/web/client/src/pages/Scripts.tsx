import { useState, useEffect } from 'react';
import { scripts, ScriptInfo, ScriptTestResult, GenerateScriptResult } from '../api';
import { useAuth } from '../auth-context';

interface ScriptForm {
  name: string;
  description: string;
  sourceCode: string;
  isConnector: boolean;
}

const emptyForm: ScriptForm = {
  name: '',
  description: '',
  sourceCode: `def run(inputs):\n    """Process inputs and return a dict."""\n    return {"result": "hello"}`,
  isConnector: false,
};

export default function ScriptsPage() {
  const { user } = useAuth();
  const [scriptList, setScriptList] = useState<ScriptInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editing, setEditing] = useState<string | null>(null); // script id or 'new'
  const [form, setForm] = useState<ScriptForm>(emptyForm);

  // Test run state
  const [testInputs, setTestInputs] = useState('{}');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ScriptTestResult | null>(null);

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null);

  // AI generation
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadScripts();
  }, []);

  const loadScripts = async () => {
    try {
      const data = await scripts.list();
      setScriptList(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startCreate = () => {
    setForm(emptyForm);
    setEditing('new');
    setTestResult(null);
    setTestInputs('{}');
    setError('');
  };

  const startEdit = async (id: string) => {
    try {
      setError('');
      const script = await scripts.get(id);
      setForm({
        name: script.name,
        description: script.description,
        sourceCode: script.sourceCode,
        isConnector: script.isConnector,
      });
      setEditing(id);
      setTestResult(null);
      setTestInputs('{}');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.sourceCode.trim()) {
      setError('Name and source code are required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await scripts.create(form);
      } else {
        await scripts.update(editing!, form);
      }
      setEditing(null);
      setForm(emptyForm);
      setTestResult(null);
      await loadScripts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await scripts.delete(id);
      setDeleting(null);
      if (editing === id) {
        setEditing(null);
        setForm(emptyForm);
        setTestResult(null);
      }
      await loadScripts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      let parsedInputs: Record<string, unknown> = {};
      try {
        parsedInputs = JSON.parse(testInputs);
      } catch {
        setError('Test inputs must be valid JSON.');
        setTesting(false);
        return;
      }

      let result: ScriptTestResult;
      if (editing === 'new' || !editing) {
        result = await scripts.testCode(form.sourceCode, parsedInputs);
      } else {
        // For saved scripts, test the current editor code (not saved version)
        result = await scripts.testCode(form.sourceCode, parsedInputs);
      }
      setTestResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const result: GenerateScriptResult = await scripts.generate(aiPrompt.trim());
      setForm({
        name: result.name,
        description: result.description,
        sourceCode: result.sourceCode,
        isConnector: false,
      });
      setEditing('new');
      setShowAiGenerator(false);
      setAiPrompt('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const isOwner = (script: ScriptInfo) => script.ownerId === user?.userId;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Scripts</h1>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAiGenerator(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              Generate with AI
            </button>
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
            >
              + New Script
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* AI Generator Panel */}
      {showAiGenerator && (
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2 text-purple-800">Generate Script with AI</h2>
          <p className="text-sm text-purple-600 mb-4">
            Describe what you want the script to do in plain language. AI will generate the Python code.
          </p>
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={4}
            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="e.g., Fetch the latest 10 items from a JSON API endpoint and return them sorted by date..."
            spellCheck={false}
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleAiGenerate}
              disabled={generating || !aiPrompt.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating...' : 'Generate'}
            </button>
            <button
              onClick={() => { setShowAiGenerator(false); setAiPrompt(''); }}
              className="px-4 py-2 border border-purple-300 rounded-lg text-sm text-purple-600 hover:bg-purple-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Editor Panel */}
      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editing === 'new' ? 'Create Script' : 'Edit Script'}
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder="e.g., fetch-spreadsheet"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder="What does this script do?"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Python Code
                <span className="text-gray-400 font-normal ml-1">
                  (must define <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">run(inputs) -&gt; dict</code>)
                </span>
              </label>
              <textarea
                value={form.sourceCode}
                onChange={e => setForm({ ...form, sourceCode: e.target.value })}
                rows={16}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent leading-relaxed"
                spellCheck={false}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isConnector}
                onChange={e => setForm({ ...form, isConnector: e.target.checked })}
                className="rounded border-gray-300 text-hive-500 focus:ring-hive-500"
              />
              This is a connector (reusable integration template)
            </label>

            {/* Test Run Section */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Test Run</h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Inputs (JSON)</label>
                  <textarea
                    value={testInputs}
                    onChange={e => setTestInputs(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                    placeholder='{"key": "value"}'
                    spellCheck={false}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleTest}
                    disabled={testing || !form.sourceCode.trim()}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {testing ? 'Running...' : 'Run Test'}
                  </button>
                </div>
              </div>

              {testResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm font-mono ${
                  testResult.success
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                      {testResult.success ? 'Success' : 'Failed'}
                    </span>
                    <span className="text-xs text-gray-500">{testResult.durationMs}ms</span>
                  </div>
                  {testResult.success && testResult.output && (
                    <pre className="text-green-800 whitespace-pre-wrap text-xs overflow-auto max-h-48">
                      {JSON.stringify(testResult.output, null, 2)}
                    </pre>
                  )}
                  {testResult.error && (
                    <pre className="text-red-700 whitespace-pre-wrap text-xs overflow-auto max-h-48">
                      {testResult.error}
                    </pre>
                  )}
                </div>
              )}
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

      {/* Scripts List */}
      {scriptList.length === 0 && !editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No scripts yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Create Python scripts to automate tasks like fetching data, sending messages, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scriptList.map(script => (
            <div
              key={script.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{script.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono">
                      {script.language}
                    </span>
                  </div>
                  {script.description && (
                    <p className="text-sm text-gray-500 mt-1">{script.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {script.isConnector && (
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                      Connector
                    </span>
                  )}
                  {script.isShared && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      Shared
                    </span>
                  )}
                  {(isOwner(script) || user?.isAdmin) && (
                    <>
                      <button
                        onClick={() => startEdit(script.id)}
                        className="text-sm text-gray-500 hover:text-hive-600 transition-colors"
                      >
                        Edit
                      </button>
                      {deleting === script.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(script.id)}
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
                          onClick={() => setDeleting(script.id)}
                          className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </>
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
