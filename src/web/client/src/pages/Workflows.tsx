import { useState, useEffect } from 'react';
import { workflows, scripts, skills, credentials, channelIdentities, tools, WorkflowInfo, WorkflowRunResult, ScriptInfo, SkillInfo, CredentialInfo, ChannelIdentityInfo, ToolInfo } from '../api';

interface InputMapping {
  type: 'static' | 'ref' | 'credential';
  value?: string;
  source?: string;
  credentialName?: string;
}

interface StepDef {
  id: string;
  type: 'script' | 'skill' | 'notify';
  scriptId?: string;
  skillName?: string;
  channel?: string;
  label?: string;
  inputs: Record<string, InputMapping>;
  tools?: string[];
}

interface WorkflowForm {
  name: string;
  description: string;
  steps: StepDef[];
}

const emptyForm: WorkflowForm = {
  name: '',
  description: '',
  steps: [],
};

let stepCounter = 0;
function newStepId() {
  stepCounter += 1;
  return `step${stepCounter}`;
}

export default function WorkflowsPage() {
  const [workflowList, setWorkflowList] = useState<WorkflowInfo[]>([]);
  const [scriptList, setScriptList] = useState<ScriptInfo[]>([]);
  const [skillList, setSkillList] = useState<SkillInfo[]>([]);
  const [credentialList, setCredentialList] = useState<CredentialInfo[]>([]);
  const [identityList, setIdentityList] = useState<ChannelIdentityInfo[]>([]);
  const [toolList, setToolList] = useState<ToolInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<WorkflowRunResult | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<WorkflowForm>(emptyForm);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [w, s, sk, creds, ids, tls] = await Promise.all([
        workflows.list(),
        scripts.list(),
        skills.list(),
        credentials.list().catch(() => [] as CredentialInfo[]),
        channelIdentities.list().catch(() => [] as ChannelIdentityInfo[]),
        tools.list().catch(() => [] as ToolInfo[])
      ]);
      setWorkflowList(w);
      setScriptList(s);
      setSkillList(sk);
      setCredentialList(creds);
      setIdentityList(ids);
      setToolList(tls);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startCreate = () => {
    stepCounter = 0;
    setForm(emptyForm);
    setEditing('new');
    setRunResult(null);
    setError('');
  };

  const startEdit = (wf: WorkflowInfo) => {
    const rawSteps: any[] = JSON.parse(wf.stepsJson || '[]');
    // Normalize: template-format steps use config.inputs (flat strings),
    // editor expects inputs: Record<string, InputMapping>
    const steps: StepDef[] = rawSteps.map(s => {
      let step: StepDef;

      if (s.inputs && typeof s.inputs === 'object' && !Array.isArray(s.inputs)) {
        // Already has editor-format inputs
        step = s as StepDef;
      } else {
        // Template-format step: convert config → editor format
        const config = s.config || {};
        const inputs: Record<string, InputMapping> = {};
        if (config.inputs && typeof config.inputs === 'object') {
          for (const [k, v] of Object.entries(config.inputs)) {
            inputs[k] = { type: 'static', value: String(v) };
          }
        }
        if (s.type === 'notify' && config.message) {
          inputs.message = { type: 'static', value: config.message };
        }
        // Resolve scriptName → scriptId
        let scriptId = s.scriptId;
        if (!scriptId && config.scriptName) {
          const found = scriptList.find(sc => sc.name === config.scriptName);
          scriptId = found?.id;
        }
        step = {
          id: s.id,
          type: s.type,
          scriptId,
          skillName: s.skillName,
          channel: s.type === 'notify' ? (config.channel || s.channel || 'telegram') : s.channel,
          label: s.label || s.name,
          inputs,
          tools: s.tools,
        } as StepDef;
      }

      // Always normalize composite channel values like "telegram:7632128601"
      if (step.type === 'notify' && step.channel && step.channel.includes(':')) {
        const colonIdx = step.channel.indexOf(':');
        const chName = step.channel.slice(0, colonIdx);
        const chUserId = step.channel.slice(colonIdx + 1);
        step = { ...step, channel: chName };
        if (!step.inputs.identityId) {
          const identity = identityList.find(
            id => id.channel === chName && id.channelUserId === chUserId
          );
          if (identity) {
            step = { ...step, inputs: { ...step.inputs, identityId: { type: 'static', value: identity.id } } };
          }
        }
      }

      return step;
    });
    stepCounter = steps.length;
    setForm({ name: wf.name, description: wf.description, steps });
    setEditing(wf.id);
    setRunResult(null);
    setError('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
    setRunResult(null);
  };

  const addStep = (type: 'script' | 'skill' | 'notify') => {
    const step: StepDef = { id: newStepId(), type, inputs: {} };
    if (type === 'notify') {
      step.channel = 'telegram';
      step.inputs = { message: { type: 'static', value: '' } };
    }
    setForm(f => ({
      ...f,
      steps: [...f.steps, step]
    }));
  };

  const removeStep = (idx: number) => {
    setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));
  };

  const updateStep = (idx: number, updates: Partial<StepDef>) => {
    setForm(f => ({
      ...f,
      steps: f.steps.map((s, i) => i === idx ? { ...s, ...updates } : s)
    }));
  };

  const addInput = (stepIdx: number, key: string) => {
    if (!key.trim()) return;
    setForm(f => ({
      ...f,
      steps: f.steps.map((s, i) =>
        i === stepIdx
          ? { ...s, inputs: { ...s.inputs, [key.trim()]: { type: 'static', value: '' } } }
          : s
      )
    }));
  };

  const updateInput = (stepIdx: number, key: string, mapping: InputMapping) => {
    setForm(f => ({
      ...f,
      steps: f.steps.map((s, i) =>
        i === stepIdx
          ? { ...s, inputs: { ...s.inputs, [key]: mapping } }
          : s
      )
    }));
  };

  const removeInput = (stepIdx: number, key: string) => {
    setForm(f => ({
      ...f,
      steps: f.steps.map((s, i) => {
        if (i !== stepIdx) return s;
        const { [key]: _, ...rest } = s.inputs;
        return { ...s, inputs: rest };
      })
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Workflow name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await workflows.create({
          name: form.name,
          description: form.description,
          stepsJson: form.steps,
        });
      } else {
        await workflows.update(editing!, {
          name: form.name,
          description: form.description,
          stepsJson: form.steps,
        });
      }
      setEditing(null);
      setForm(emptyForm);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await workflows.delete(id);
      setDeleting(null);
      if (editing === id) cancelEdit();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    setRunResult(null);
    setError('');
    try {
      const result = await workflows.run(id);
      setRunResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(null);
    }
  };

  // Get previous steps for ref dropdowns
  const getPreviousSteps = (currentIdx: number) =>
    form.steps.slice(0, currentIdx).map(s => s.id);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workflows</h1>
        {!editing && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
          >
            + New Workflow
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* Run Result */}
      {runResult && (
        <div className={`mb-6 p-4 rounded-xl border ${
          runResult.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`font-medium ${runResult.status === 'completed' ? 'text-green-700' : 'text-red-700'}`}>
              Run {runResult.status} ({runResult.totalDurationMs}ms)
            </span>
            <button onClick={() => setRunResult(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
          </div>
          <div className="space-y-2">
            {runResult.steps.map(step => (
              <div key={step.id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    step.status === 'completed' ? 'bg-green-500' :
                    step.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <span className="font-mono text-xs">{step.id}</span>
                  <span className="text-gray-500">({step.durationMs}ms)</span>
                  {step.error && <span className="text-red-600 text-xs">{step.error}</span>}
                </div>
                {step.output != null && (
                  <pre className="ml-4 mt-1 p-2 bg-white rounded border border-gray-200 text-xs font-mono text-gray-700 overflow-auto max-h-48">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editing === 'new' ? 'Create Workflow' : 'Edit Workflow'}
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
                  placeholder="e.g., morning-brief"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                  placeholder="What does this workflow do?"
                />
              </div>
            </div>

            {/* Steps Builder */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Steps</label>
              {form.steps.length === 0 && (
                <p className="text-sm text-gray-400 mb-2">No steps yet. Add a script, skill, or notify step below.</p>
              )}
              <div className="space-y-3">
                {form.steps.map((step, idx) => (
                  <div key={step.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">{step.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          step.type === 'script' ? 'bg-blue-100 text-blue-700' :
                          step.type === 'notify' ? 'bg-green-100 text-green-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {step.type}
                        </span>
                      </div>
                      <button
                        onClick={() => removeStep(idx)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>

                    {/* Step target */}
                    {step.type === 'script' && (
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Script</label>
                        <select
                          value={step.scriptId || ''}
                          onChange={e => updateStep(idx, { scriptId: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                        >
                          <option value="">Select a script...</option>
                          {scriptList.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {step.type === 'skill' && (
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Skill</label>
                        <select
                          value={step.skillName || ''}
                          onChange={e => updateStep(idx, { skillName: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                        >
                          <option value="">Select a skill...</option>
                          {skillList.map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {step.type === 'skill' && toolList.length > 0 && (
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Tools</label>
                        <p className="text-xs text-gray-400 mb-2">Give the AI access to these tools during this step.</p>
                        <div className="space-y-1">
                          {toolList.map(tool => (
                            <label key={tool.name} className="flex items-start gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(step.tools || []).includes(tool.name)}
                                onChange={e => {
                                  const current = step.tools || [];
                                  const updated = e.target.checked
                                    ? [...current, tool.name]
                                    : current.filter(t => t !== tool.name);
                                  updateStep(idx, { tools: updated.length > 0 ? updated : undefined });
                                }}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="font-mono text-xs">{tool.name}</span>
                                <span className="text-xs text-gray-400 ml-1">— {tool.description}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {step.type === 'notify' && (
                      <div className="mb-3 space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Channel</label>
                          <select
                            value={step.channel || 'telegram'}
                            onChange={e => updateStep(idx, { channel: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                          >
                            <option value="telegram">Telegram</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Recipient</label>
                          <select
                            value={
                              step.inputs.recipient ? 'custom' :
                              step.inputs.identityId ? (step.inputs.identityId as InputMapping).value || '' :
                              'auto'
                            }
                            onChange={e => {
                              const val = e.target.value;
                              const newInputs = { ...step.inputs };
                              // Remove old recipient/identityId inputs
                              delete newInputs.recipient;
                              delete newInputs.identityId;
                              if (val === 'custom') {
                                newInputs.recipient = { type: 'static', value: '' };
                              } else if (val !== 'auto') {
                                // val is an identity ID
                                newInputs.identityId = { type: 'static', value: val };
                              }
                              updateStep(idx, { inputs: newInputs });
                            }}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                          >
                            <option value="auto">Auto-detect (from linked identities)</option>
                            {identityList
                              .filter(id => id.channel === (step.channel || 'telegram'))
                              .map(id => (
                                <option key={id.id} value={id.id}>
                                  {id.label || id.channel} ({id.channelUserId})
                                </option>
                              ))
                            }
                            <option value="custom">Custom chat ID...</option>
                          </select>
                          {step.inputs.recipient && (
                            <input
                              type="text"
                              value={(step.inputs.recipient as InputMapping).value || ''}
                              onChange={e => updateInput(idx, 'recipient', { type: 'static', value: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono mt-2 focus:outline-none focus:ring-2 focus:ring-hive-500"
                              placeholder="Enter chat ID..."
                            />
                          )}
                          {!step.inputs.recipient && !step.inputs.identityId && identityList.filter(id => id.channel === (step.channel || 'telegram')).length === 0 && (
                            <p className="text-xs text-amber-600 mt-1">
                              No linked {step.channel || 'telegram'} accounts found. Link one in Settings &gt; Identities.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Inputs */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Inputs</label>
                      {Object.entries(step.inputs).map(([key, mapping]) => (
                        <div key={key} className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono w-24 truncate" title={key}>{key}</span>
                          <select
                            value={mapping.type}
                            onChange={e => {
                              const newType = e.target.value as 'static' | 'ref' | 'credential';
                              updateInput(idx, key, {
                                type: newType,
                                value: newType === 'static' ? mapping.value : undefined,
                                source: newType === 'ref' ? mapping.source : undefined,
                                credentialName: newType === 'credential' ? mapping.credentialName : undefined
                              });
                            }}
                            className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
                          >
                            <option value="static">Static</option>
                            <option value="ref">From step</option>
                            <option value="credential">Credential</option>
                          </select>
                          {mapping.type === 'static' && (
                            <input
                              type="text"
                              value={mapping.value || ''}
                              onChange={e => updateInput(idx, key, { ...mapping, value: e.target.value })}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                              placeholder="value"
                            />
                          )}
                          {mapping.type === 'ref' && (
                            <input
                              type="text"
                              value={mapping.source || ''}
                              onChange={e => updateInput(idx, key, { ...mapping, source: e.target.value })}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                              placeholder={`e.g., ${getPreviousSteps(idx)[0] || 'step1'}.tasks`}
                            />
                          )}
                          {mapping.type === 'credential' && (
                            <select
                              value={mapping.credentialName || ''}
                              onChange={e => updateInput(idx, key, { ...mapping, credentialName: e.target.value })}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                            >
                              <option value="">Select credential...</option>
                              {credentialList.map(c => (
                                <option key={c.id} value={c.name}>{c.name} ({c.service})</option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={() => removeInput(idx, key)}
                            className="text-xs text-gray-400 hover:text-red-600"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const key = prompt('Input parameter name:');
                          if (key) addInput(idx, key);
                        }}
                        className="text-xs text-hive-600 hover:text-hive-700"
                      >
                        + Add input
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => addStep('script')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  + Script Step
                </button>
                <button
                  onClick={() => addStep('skill')}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  + Skill Step
                </button>
                <button
                  onClick={() => addStep('notify')}
                  className="px-3 py-1.5 border border-green-300 rounded-lg text-xs text-green-700 hover:bg-green-50 transition-colors"
                >
                  + Notify Step
                </button>
              </div>
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

      {/* List */}
      {workflowList.length === 0 && !editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No workflows yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Create workflows to chain scripts and AI skills together into automated pipelines.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflowList.map(wf => {
            const steps: StepDef[] = JSON.parse(wf.stepsJson || '[]');
            return (
              <div key={wf.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{wf.name}</h3>
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {steps.length} step{steps.length !== 1 ? 's' : ''}
                      </span>
                      {wf.isActive && (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Active</span>
                      )}
                    </div>
                    {wf.description && (
                      <p className="text-sm text-gray-500 mt-1">{wf.description}</p>
                    )}
                    {steps.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        {steps.map((s, i) => (
                          <span key={s.id} className="flex items-center">
                            {i > 0 && <span className="text-gray-300 mx-1">&rarr;</span>}
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              s.type === 'script' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                            }`}>
                              {s.type === 'script'
                                ? scriptList.find(sc => sc.id === s.scriptId)?.name || s.scriptId || (s as any).config?.scriptName || s.id
                                : s.type === 'notify'
                                ? s.label || (s as any).name || 'notify'
                                : s.skillName || s.id
                              }
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    <button
                      onClick={() => handleRun(wf.id)}
                      disabled={running === wf.id}
                      className="text-sm text-hive-600 hover:text-hive-700 font-medium disabled:opacity-50"
                    >
                      {running === wf.id ? 'Running...' : 'Run'}
                    </button>
                    <button
                      onClick={() => startEdit(wf)}
                      className="text-sm text-gray-500 hover:text-hive-600 transition-colors"
                    >
                      Edit
                    </button>
                    {deleting === wf.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(wf.id)}
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
                        onClick={() => setDeleting(wf.id)}
                        className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
