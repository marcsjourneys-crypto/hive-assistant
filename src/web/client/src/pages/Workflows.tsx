import { useState, useEffect } from 'react';
import { workflows, scripts, skills, credentials, channelIdentities, tools, WorkflowInfo, WorkflowRunResult, WorkflowRunInfo, ScriptInfo, SkillInfo, CredentialInfo, ChannelIdentityInfo, ToolInfo } from '../api';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types for action registry and templates
interface UserInputSchema {
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  default?: unknown;
  required?: boolean;
  placeholder?: string;
}

interface ActionDefinition {
  id: string;
  category: string;
  label: string;
  description: string;
  icon?: string;
  stepType: 'tool' | 'notify' | 'skill';
  toolName?: string;
  channel?: string;
  skillName?: string;
  presetInputs: Record<string, unknown>;
  userInputs: Record<string, UserInputSchema>;
  adminOnly?: boolean;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  stepCount: number;
  suggestedSchedule?: string;
}

interface GenerateResult {
  name: string;
  description: string;
  steps: StepDef[];
  reasoning: string;
  validation: {
    isValid: boolean;
    errors: Array<{ stepId?: string; message: string }>;
    warnings: Array<{ stepId?: string; message: string }>;
  };
}

interface InputMapping {
  type: 'static' | 'ref' | 'credential';
  value?: string;
  source?: string;
  credentialName?: string;
}

interface StepDef {
  id: string;
  type: 'script' | 'skill' | 'notify' | 'tool';
  scriptId?: string;
  skillName?: string;
  toolName?: string; // for direct tool invocation
  channel?: string;
  label?: string;
  inputs: Record<string, InputMapping>;
  tools?: string[]; // for skill steps
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

// Sortable step wrapper for drag-and-drop reordering
function SortableStep({
  step,
  children
}: {
  step: StepDef;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          type="button"
          {...listeners}
          className="mt-4 px-1 py-2 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          ⋮⋮
        </button>
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
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
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<WorkflowRunInfo[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Template and AI state
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [actionsByCategory, setActionsByCategory] = useState<Record<string, ActionDefinition[]>>({});
  const [showAIBuilder, setShowAIBuilder] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<GenerateResult | null>(null);
  const [showTemplates, setShowTemplates] = useState(true);

  // Step picker state
  const [showStepPicker, setShowStepPicker] = useState(false);
  const [stepPickerCategory, setStepPickerCategory] = useState<string | null>(null);

  // Drag-and-drop sensors for step reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setForm(f => {
        const oldIndex = f.steps.findIndex(s => s.id === active.id);
        const newIndex = f.steps.findIndex(s => s.id === over.id);
        return { ...f, steps: arrayMove(f.steps, oldIndex, newIndex) };
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [w, s, sk, creds, ids, tls, tmpls, acts] = await Promise.all([
        workflows.list(),
        scripts.list(),
        skills.list(),
        credentials.list().catch(() => [] as CredentialInfo[]),
        channelIdentities.list().catch(() => [] as ChannelIdentityInfo[]),
        tools.list().catch(() => [] as ToolInfo[]),
        workflows.getTemplates().catch(() => [] as WorkflowTemplate[]),
        workflows.getActions().catch(() => ({} as Record<string, ActionDefinition[]>))
      ]);
      setWorkflowList(w);
      setScriptList(s);
      setSkillList(sk);
      setCredentialList(creds);
      setIdentityList(ids);
      setToolList(tls);
      setTemplates(tmpls);
      setActionsByCategory(acts);
      // Show templates section if no workflows exist yet
      setShowTemplates(w.length === 0);
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

  const addStep = (type: 'script' | 'skill' | 'notify' | 'tool') => {
    const step: StepDef = { id: newStepId(), type, inputs: {} };
    if (type === 'notify') {
      step.channel = 'telegram';
      step.inputs = { message: { type: 'static', value: '' } };
    }
    if (type === 'tool') {
      // Default to manage_email with list_emails action
      step.toolName = 'manage_email';
      step.inputs = { action: { type: 'static', value: 'list_emails' } };
    }
    setForm(f => ({
      ...f,
      steps: [...f.steps, step]
    }));
  };

  // Add step from pre-built action
  const addStepFromAction = (action: ActionDefinition) => {
    const step: StepDef = {
      id: newStepId(),
      type: action.stepType,
      label: action.label,
      inputs: {}
    };

    // Set up based on step type
    if (action.stepType === 'tool' && action.toolName) {
      step.toolName = action.toolName;
    }
    if (action.stepType === 'notify' && action.channel) {
      step.channel = action.channel;
    }
    if (action.stepType === 'skill') {
      step.skillName = action.skillName;
    }

    // Add preset inputs as static values
    for (const [key, value] of Object.entries(action.presetInputs)) {
      step.inputs[key] = { type: 'static', value: String(value) };
    }

    // Add user inputs with defaults
    for (const [key, schema] of Object.entries(action.userInputs || {})) {
      const typedSchema = schema as { default?: unknown; type: string };
      if (typedSchema.default !== undefined) {
        step.inputs[key] = { type: 'static', value: String(typedSchema.default) };
      } else {
        step.inputs[key] = { type: 'static', value: '' };
      }
    }

    setForm(f => ({
      ...f,
      steps: [...f.steps, step]
    }));
    setShowStepPicker(false);
    setStepPickerCategory(null);
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

  const handleToggleActive = async (wf: WorkflowInfo) => {
    setToggling(wf.id);
    try {
      await workflows.update(wf.id, { isActive: !wf.isActive });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  const toggleHistory = async (workflowId: string) => {
    if (historyFor === workflowId) {
      setHistoryFor(null);
      setRunHistory([]);
      setExpandedRun(null);
      return;
    }
    setHistoryFor(workflowId);
    setLoadingHistory(true);
    setExpandedRun(null);
    try {
      const runs = await workflows.runs(workflowId, 10);
      setRunHistory(runs);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  // Get previous steps for ref dropdowns
  const getPreviousSteps = (currentIdx: number) =>
    form.steps.slice(0, currentIdx).map(s => s.id);

  // Template and AI handlers
  const handleUseTemplate = async (templateId: string) => {
    try {
      const wf = await workflows.createFromTemplate(templateId);
      await loadData();
      startEdit(wf);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiDescription.trim()) {
      setError('Please describe what you want the workflow to do.');
      return;
    }
    setAiGenerating(true);
    setAiResult(null);
    setError('');
    try {
      const result = await workflows.generate(aiDescription);
      setAiResult(result as GenerateResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleConfirmGenerated = async () => {
    if (!aiResult) return;
    try {
      const wf = await workflows.confirmGenerated(
        aiResult.name,
        aiResult.description,
        aiResult.steps
      );
      setShowAIBuilder(false);
      setAiDescription('');
      setAiResult(null);
      await loadData();
      startEdit(wf);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEditGenerated = () => {
    if (!aiResult) return;
    // Load the generated steps into the editor
    stepCounter = aiResult.steps.length;
    setForm({
      name: aiResult.name,
      description: aiResult.description,
      steps: aiResult.steps as StepDef[]
    });
    setEditing('new');
    setShowAIBuilder(false);
    setAiDescription('');
    setAiResult(null);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workflows</h1>
        {!editing && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAIBuilder(true)}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors flex items-center gap-2"
            >
              <span>🤖</span> Create with AI
            </button>
            <button
              onClick={startCreate}
              className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
            >
              + New Workflow
            </button>
          </div>
        )}
      </div>

      {/* AI Workflow Builder Modal */}
      {showAIBuilder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span>🤖</span> Create Workflow with AI
                </h2>
                <button
                  onClick={() => {
                    setShowAIBuilder(false);
                    setAiDescription('');
                    setAiResult(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  &times;
                </button>
              </div>

              {!aiResult ? (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    Describe what you want your workflow to do in plain English. For example:
                    <br />
                    <em className="text-gray-400">"Every morning, get my unread emails and today's calendar events, summarize them, and send to Telegram"</em>
                  </p>

                  <textarea
                    value={aiDescription}
                    onChange={e => setAiDescription(e.target.value)}
                    placeholder="Describe your workflow..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    rows={4}
                    disabled={aiGenerating}
                  />

                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      onClick={() => {
                        setShowAIBuilder(false);
                        setAiDescription('');
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAIGenerate}
                      disabled={aiGenerating || !aiDescription.trim()}
                      className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 flex items-center gap-2"
                    >
                      {aiGenerating ? (
                        <>
                          <span className="animate-spin">⏳</span> Generating...
                        </>
                      ) : (
                        'Generate Workflow'
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* AI Result Preview */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">{aiResult.name}</h3>
                      <p className="text-sm text-gray-500">{aiResult.description}</p>
                    </div>

                    {/* Validation Status */}
                    {!aiResult.validation.isValid && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-red-700 mb-2">Validation Issues:</p>
                        {aiResult.validation.errors.map((err, i) => (
                          <p key={i} className="text-sm text-red-600">
                            {err.stepId && <span className="font-mono">[{err.stepId}]</span>} {err.message}
                          </p>
                        ))}
                      </div>
                    )}

                    {aiResult.validation.warnings.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-amber-700 mb-2">Warnings:</p>
                        {aiResult.validation.warnings.map((warn, i) => (
                          <p key={i} className="text-sm text-amber-600">
                            {warn.stepId && <span className="font-mono">[{warn.stepId}]</span>} {warn.message}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Steps Preview */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Steps:</h4>
                      <div className="space-y-2">
                        {aiResult.steps.map((step, i) => (
                          <div key={step.id} className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{step.id}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              step.type === 'tool' ? 'bg-amber-100 text-amber-700' :
                              step.type === 'notify' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {step.type}
                            </span>
                            <span className="text-sm text-gray-600">{step.label || step.toolName || step.skillName || step.channel}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">AI Reasoning:</p>
                      <p className="text-sm text-gray-600">{aiResult.reasoning}</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setAiResult(null)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={handleEditGenerated}
                      className="px-4 py-2 border border-purple-300 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50"
                    >
                      Edit Manually
                    </button>
                    <button
                      onClick={handleConfirmGenerated}
                      disabled={!aiResult.validation.isValid}
                      className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50"
                    >
                      Create Workflow
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Template Gallery Toggle (always visible when templates exist) */}
      {!editing && templates.length > 0 && !showTemplates && workflowList.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowTemplates(true)}
            className="text-sm text-hive-600 hover:text-hive-700 flex items-center gap-1"
          >
            <span>📋</span> View quick start templates
          </button>
        </div>
      )}

      {/* Template Gallery */}
      {!editing && templates.length > 0 && (showTemplates || workflowList.length === 0) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">Quick Start Templates</h2>
            {workflowList.length > 0 && (
              <button
                onClick={() => setShowTemplates(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Hide
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => handleUseTemplate(t.id)}
                className="bg-white border border-gray-200 rounded-xl p-4 text-left hover:border-hive-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{t.icon || '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{t.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{t.stepCount} steps</span>
                      <span className="text-xs text-gray-400">{t.category}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={form.steps.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {form.steps.map((step, idx) => (
                      <SortableStep key={step.id} step={step}>
                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded">{step.id}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                step.type === 'script' ? 'bg-blue-100 text-blue-700' :
                                step.type === 'notify' ? 'bg-green-100 text-green-700' :
                                step.type === 'tool' ? 'bg-amber-100 text-amber-700' :
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
                    {step.type === 'tool' && (
                      <div className="mb-3 space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Tool</label>
                          <select
                            value={step.toolName || ''}
                            onChange={e => {
                              const toolName = e.target.value;
                              // Reset inputs when tool changes, set appropriate defaults
                              let defaultInputs: Record<string, InputMapping> = {};
                              if (toolName === 'manage_email') {
                                defaultInputs = { action: { type: 'static', value: 'list_emails' } };
                              } else if (toolName === 'manage_calendar') {
                                defaultInputs = { action: { type: 'static', value: 'list_events' } };
                              }
                              updateStep(idx, { toolName, inputs: defaultInputs });
                            }}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                          >
                            <option value="">Select a tool...</option>
                            {toolList.map(t => (
                              <option key={t.name} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                        {step.toolName && (
                          <p className="text-xs text-gray-400">
                            {toolList.find(t => t.name === step.toolName)?.description || ''}
                          </p>
                        )}
                        {step.toolName === 'manage_email' && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Action</label>
                            <select
                              value={(step.inputs.action as InputMapping)?.value || 'list_emails'}
                              onChange={e => updateInput(idx, 'action', { type: 'static', value: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                            >
                              <option value="list_emails">List emails</option>
                              <option value="read_email">Read email</option>
                              <option value="search_emails">Search emails</option>
                              <option value="send_email">Send email</option>
                              <option value="reply_email">Reply to email</option>
                              <option value="list_labels">List labels</option>
                            </select>
                          </div>
                        )}
                        {step.toolName === 'manage_calendar' && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Action</label>
                            <select
                              value={(step.inputs.action as InputMapping)?.value || 'list_events'}
                              onChange={e => updateInput(idx, 'action', { type: 'static', value: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500"
                            >
                              <option value="list_calendars">List calendars</option>
                              <option value="list_events">List events</option>
                              <option value="create_event">Create event</option>
                              <option value="delete_event">Delete event</option>
                              <option value="find_events">Find events</option>
                            </select>
                          </div>
                        )}
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
                      </SortableStep>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Categorized Step Picker */}
              <div className="relative mt-3">
                <button
                  onClick={() => setShowStepPicker(!showStepPicker)}
                  className="px-4 py-2 bg-hive-100 text-hive-700 rounded-lg text-sm font-medium hover:bg-hive-200 transition-colors flex items-center gap-2"
                >
                  <span className="text-lg">+</span> Add Step
                </button>

                {showStepPicker && (
                  <div className="absolute left-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg z-10 min-w-[300px]">
                    {stepPickerCategory === null ? (
                      // Category selection
                      <div className="p-2">
                        <p className="text-xs text-gray-400 px-2 py-1 mb-1">Choose a category</p>
                        {Object.entries(actionsByCategory).map(([category, actions]) => {
                          const icon = actions[0]?.icon || '📋';
                          const categoryColors: Record<string, string> = {
                            'Email': 'hover:bg-blue-50 text-blue-700',
                            'Calendar': 'hover:bg-purple-50 text-purple-700',
                            'Notifications': 'hover:bg-green-50 text-green-700',
                            'Data': 'hover:bg-amber-50 text-amber-700',
                            'AI Assistant': 'hover:bg-pink-50 text-pink-700',
                            'Advanced': 'hover:bg-gray-100 text-gray-600'
                          };
                          return (
                            <button
                              key={category}
                              onClick={() => setStepPickerCategory(category)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${categoryColors[category] || 'hover:bg-gray-50'}`}
                            >
                              <span className="text-lg">{icon}</span>
                              <div className="flex-1">
                                <span className="font-medium">{category}</span>
                                <span className="text-xs text-gray-400 ml-2">{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
                              </div>
                              <span className="text-gray-300">›</span>
                            </button>
                          );
                        })}
                        <div className="border-t border-gray-100 mt-2 pt-2">
                          <button
                            onClick={() => { setShowStepPicker(false); addStep('skill'); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm hover:bg-purple-50 text-purple-700 transition-colors"
                          >
                            <span className="text-lg">🎯</span>
                            <div className="flex-1">
                              <span className="font-medium">Use a Skill</span>
                              <span className="text-xs text-gray-400 ml-2">from your library</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Action selection within category
                      <div className="p-2">
                        <button
                          onClick={() => setStepPickerCategory(null)}
                          className="flex items-center gap-2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 mb-1"
                        >
                          <span>‹</span> Back
                        </button>
                        <p className="text-xs text-gray-400 px-2 py-1">{stepPickerCategory}</p>
                        {(actionsByCategory[stepPickerCategory] || []).map(action => (
                          <button
                            key={action.id}
                            onClick={() => addStepFromAction(action)}
                            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-lg mt-0.5">{action.icon || '📋'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-700">{action.label}</p>
                              <p className="text-xs text-gray-400 line-clamp-1">{action.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border-t border-gray-100 p-2">
                      <button
                        onClick={() => { setShowStepPicker(false); setStepPickerCategory(null); }}
                        className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        wf.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {wf.isActive ? 'Active' : 'Inactive'}
                      </span>
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
                      onClick={() => handleToggleActive(wf)}
                      disabled={toggling === wf.id}
                      className={`text-sm transition-colors disabled:opacity-50 ${
                        wf.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'
                      }`}
                    >
                      {toggling === wf.id ? '...' : wf.isActive ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleRun(wf.id)}
                      disabled={running === wf.id}
                      className="text-sm text-hive-600 hover:text-hive-700 font-medium disabled:opacity-50"
                    >
                      {running === wf.id ? 'Running...' : 'Run'}
                    </button>
                    <button
                      onClick={() => toggleHistory(wf.id)}
                      className={`text-sm transition-colors ${historyFor === wf.id ? 'text-hive-600 font-medium' : 'text-gray-500 hover:text-hive-600'}`}
                    >
                      History
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

                {/* Run History Panel */}
                {historyFor === wf.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Runs</h4>
                    {loadingHistory ? (
                      <p className="text-xs text-gray-400">Loading...</p>
                    ) : runHistory.length === 0 ? (
                      <p className="text-xs text-gray-400">No runs yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {runHistory.map(run => {
                          let stepsData: { steps?: Array<{ id: string; status: string; durationMs: number; output?: unknown; error?: string }> } = {};
                          try { stepsData = JSON.parse(run.stepsResult || '{}'); } catch { /* ignore */ }
                          const runSteps = stepsData.steps || [];
                          return (
                            <div key={run.id} className="border border-gray-100 rounded-lg">
                              <button
                                onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 rounded-lg transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className={`inline-block w-2 h-2 rounded-full ${
                                    run.status === 'completed' ? 'bg-green-500' :
                                    run.status === 'failed' ? 'bg-red-500' :
                                    'bg-yellow-500 animate-pulse'
                                  }`} />
                                  <span className="text-xs text-gray-600">{formatDate(run.startedAt)}</span>
                                  <span className={`text-xs font-medium ${
                                    run.status === 'completed' ? 'text-green-700' :
                                    run.status === 'failed' ? 'text-red-700' :
                                    'text-yellow-700'
                                  }`}>
                                    {run.status}
                                  </span>
                                  {run.completedAt && run.startedAt && (
                                    <span className="text-xs text-gray-400">
                                      {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()))}ms
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400">{expandedRun === run.id ? '\u25B2' : '\u25BC'}</span>
                              </button>
                              {expandedRun === run.id && (
                                <div className="px-3 pb-3 space-y-2">
                                  {run.error && (
                                    <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{run.error}</div>
                                  )}
                                  {runSteps.map(rs => (
                                    <div key={rs.id}>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                                          rs.status === 'completed' ? 'bg-green-500' :
                                          rs.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                                        }`} />
                                        <span className="font-mono text-gray-600">{rs.id}</span>
                                        <span className="text-gray-400">{rs.durationMs}ms</span>
                                        {rs.error && <span className="text-red-500">{rs.error}</span>}
                                      </div>
                                      {rs.output != null && (
                                        <pre className="ml-4 mt-1 p-2 bg-gray-50 rounded border border-gray-100 text-[11px] font-mono text-gray-600 overflow-auto max-h-32">
                                          {JSON.stringify(rs.output, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
