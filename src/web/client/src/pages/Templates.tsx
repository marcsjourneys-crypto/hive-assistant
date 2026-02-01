import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { templates, files, channelIdentities, credentials, TemplateInfo, TemplateParameter, FileInfoResponse, ChannelIdentityInfo, CredentialInfo } from '../api';

export default function TemplatesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templateList, setTemplateList] = useState<TemplateInfo[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // "Use this" modal state
  const [usingTemplate, setUsingTemplate] = useState<TemplateInfo | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  // Data for parameter dropdowns
  const [fileList, setFileList] = useState<FileInfoResponse[]>([]);
  const [identityList, setIdentityList] = useState<ChannelIdentityInfo[]>([]);
  const [credentialList, setCredentialList] = useState<CredentialInfo[]>([]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await templates.list();
      setTemplateList(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openUseModal = async (template: TemplateInfo) => {
    setUsingTemplate(template);
    setError('');

    // Parse parameters and set defaults
    const params: TemplateParameter[] = JSON.parse(template.parametersJson || '[]');
    const defaults: Record<string, string> = {};
    for (const p of params) {
      defaults[p.key] = p.default || '';
    }
    setParamValues(defaults);

    // Load data for dropdowns
    try {
      const [f, i, c] = await Promise.all([
        files.list(),
        channelIdentities.list(),
        credentials.list()
      ]);
      setFileList(f);
      setIdentityList(i);
      setCredentialList(c);
    } catch {
      // Non-critical
    }
  };

  const handleUseTemplate = async () => {
    if (!usingTemplate) return;
    setCreating(true);
    setError('');
    try {
      const workflow = await templates.use(usingTemplate.id, paramValues);
      setUsingTemplate(null);
      navigate('/automation/workflows');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await templates.delete(id);
      await loadTemplates();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'File Processing': 'bg-blue-100 text-blue-700 border-blue-200',
      'Notifications': 'bg-green-100 text-green-700 border-green-200',
      'Data': 'bg-purple-100 text-purple-700 border-purple-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const renderParamInput = (param: TemplateParameter) => {
    const value = paramValues[param.key] || '';

    switch (param.type) {
      case 'file':
        return (
          <select
            value={value}
            onChange={e => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a file...</option>
            {fileList.map(f => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
        );

      case 'channel':
        return (
          <select
            value={value}
            onChange={e => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a channel...</option>
            {identityList.map(i => (
              <option key={i.id} value={`${i.channel}:${i.channelUserId}`}>
                {i.label || i.channelUserId} ({i.channel})
              </option>
            ))}
          </select>
        );

      case 'credential':
        return (
          <select
            value={value}
            onChange={e => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a credential...</option>
            {credentialList.map(c => (
              <option key={c.id} value={c.name}>{c.name} ({c.service})</option>
            ))}
          </select>
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={e => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select...</option>
            {(param.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'text':
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={e => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
            placeholder={param.description}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        );
    }
  };

  const params: TemplateParameter[] = usingTemplate
    ? JSON.parse(usingTemplate.parametersJson || '[]')
    : [];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ready-made workflow recipes. Fill in the parameters and create a workflow in seconds.
          </p>
        </div>
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading templates...</div>
      ) : templateList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No templates available yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Templates will appear here once an admin creates them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templateList.map(template => (
            <div key={template.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{template.name}</h3>
                {template.category && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${getCategoryColor(template.category)}`}>
                    {template.category}
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500 flex-1 mb-4">{template.description}</p>

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {JSON.parse(template.parametersJson || '[]').length} parameter(s)
                </div>
                <div className="flex items-center gap-2">
                  {user?.isAdmin && (
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                  {!template.isPublished && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">
                      Draft
                    </span>
                  )}
                  <button
                    onClick={() => openUseModal(template)}
                    className="px-3 py-1.5 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
                  >
                    Use this
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Use Template Modal */}
      {usingTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold">{usingTemplate.name}</h2>
              <p className="text-sm text-gray-500 mt-1">{usingTemplate.description}</p>
            </div>

            <div className="p-6 space-y-4">
              {params.length === 0 ? (
                <p className="text-sm text-gray-500">This template has no parameters. Click "Create Workflow" to proceed.</p>
              ) : (
                params.map(param => (
                  <div key={param.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {param.label}
                    </label>
                    {param.description && (
                      <p className="text-xs text-gray-400 mb-1.5">{param.description}</p>
                    )}
                    {renderParamInput(param)}
                  </div>
                ))
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setUsingTemplate(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUseTemplate}
                disabled={creating}
                className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
