import { useState, useEffect } from 'react';
import { workflows, scripts, skills, WorkflowInfo, WorkflowRunResult, ScriptInfo, SkillInfo } from '../api';

interface InputMapping {
  type: 'static' | 'ref';
  value?: string;
  source?: string;
}

interface StepDef {
  id: string;
  type: 'script' | 'skill';
  scriptId?: string;
  skillName?: string;
  label?: string;
  inputs: Record<string, InputMapping>;
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
      const [w, s, sk] = await Promise.all([
        workflows.list(),
        scripts.list(),
        skills.list()
      ]);
      setWorkflowList(w);
      setScriptList(s);
      setSkillList(sk);
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
    const steps: StepDef[] = JSON.parse(wf.stepsJson || '[]');
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

  const addStep = (type: 'script' | 'skill') => {
    setForm(f => ({
      ...f,
      steps: [...f.steps, { id: newStepId(), type, inputs: {} }]
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
                <p className="text-sm text-gray-400 mb-2">No steps yet. Add a script or skill step below.</p>
              )}
              <div className="space-y-3">
                {form.steps.map((step, idx) => (
                  <div key={step.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">{step.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          step.type === 'script' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
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
                    {step.type === 'script' ? (
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
                    ) : (
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

                    {/* Inputs */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Inputs</label>
                      {Object.entries(step.inputs).map(([key, mapping]) => (
                        <div key={key} className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono w-24 truncate" title={key}>{key}</span>
                          <select
                            value={mapping.type}
                            onChange={e => updateInput(idx, key, {
                              ...mapping,
                              type: e.target.value as 'static' | 'ref',
                              value: e.target.value === 'static' ? mapping.value : undefined,
                              source: e.target.value === 'ref' ? mapping.source : undefined
                            })}
                            className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
                          >
                            <option value="static">Static</option>
                            <option value="ref">From step</option>
                          </select>
                          {mapping.type === 'static' ? (
                            <input
                              type="text"
                              value={mapping.value || ''}
                              onChange={e => updateInput(idx, key, { ...mapping, value: e.target.value })}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                              placeholder="value"
                            />
                          ) : (
                            <input
                              type="text"
                              value={mapping.source || ''}
                              onChange={e => updateInput(idx, key, { ...mapping, source: e.target.value })}
                              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                              placeholder={`e.g., ${getPreviousSteps(idx)[0] || 'step1'}.output.result`}
                            />
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
                                ? scriptList.find(sc => sc.id === s.scriptId)?.name || s.scriptId
                                : s.skillName
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
