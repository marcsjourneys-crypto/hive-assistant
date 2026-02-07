import { useState, useEffect } from 'react';
import { schedules, workflows, ScheduleInfo, WorkflowInfo } from '../api';

type Frequency = 'daily' | 'weekdays' | 'weekends' | 'specific';

interface ScheduleForm {
  workflowId: string;
  hour: number;
  minute: number;
  frequency: Frequency;
  selectedDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  timezone: string;
  isActive: boolean;
}

const emptyForm: ScheduleForm = {
  workflowId: '',
  hour: 7,
  minute: 0,
  frequency: 'daily',
  selectedDays: [1, 2, 3, 4, 5], // Mon-Fri default
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  isActive: true,
};

const DAYS = [
  { value: 0, label: 'Sun', short: 'S' },
  { value: 1, label: 'Mon', short: 'M' },
  { value: 2, label: 'Tue', short: 'T' },
  { value: 3, label: 'Wed', short: 'W' },
  { value: 4, label: 'Thu', short: 'T' },
  { value: 5, label: 'Fri', short: 'F' },
  { value: 6, label: 'Sat', short: 'S' },
];

// Convert friendly form to cron expression
function toCron(form: ScheduleForm): string {
  const { minute, hour, frequency, selectedDays } = form;
  let dayPart = '*';

  if (frequency === 'weekdays') {
    dayPart = '1-5';
  } else if (frequency === 'weekends') {
    dayPart = '0,6';
  } else if (frequency === 'specific' && selectedDays.length > 0) {
    dayPart = selectedDays.sort((a, b) => a - b).join(',');
  }

  return `${minute} ${hour} * * ${dayPart}`;
}

// Parse cron expression to friendly form
function fromCron(cron: string): Partial<ScheduleForm> {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return {};

  const [minute, hour, , , dayOfWeek] = parts;

  // Parse minute and hour
  const m = parseInt(minute, 10);
  const h = parseInt(hour, 10);
  if (isNaN(m) || isNaN(h)) return {};

  // Parse day of week
  let frequency: Frequency = 'daily';
  let selectedDays: number[] = [];

  if (dayOfWeek === '*') {
    frequency = 'daily';
  } else if (dayOfWeek === '1-5') {
    frequency = 'weekdays';
  } else if (dayOfWeek === '0,6' || dayOfWeek === '6,0') {
    frequency = 'weekends';
  } else {
    frequency = 'specific';
    // Parse comma-separated days or ranges
    const dayParts = dayOfWeek.split(',');
    for (const part of dayParts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let d = start; d <= end; d++) {
          selectedDays.push(d);
        }
      } else {
        const d = parseInt(part, 10);
        if (!isNaN(d)) selectedDays.push(d);
      }
    }
  }

  return { minute: m, hour: h, frequency, selectedDays };
}

// Format cron to human-readable string
function formatSchedule(cron: string): string {
  const parsed = fromCron(cron);
  if (!parsed.hour === undefined) return cron;

  const h = parsed.hour!;
  const m = parsed.minute!;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const time = `${hour12}:${m.toString().padStart(2, '0')} ${period}`;

  switch (parsed.frequency) {
    case 'daily':
      return `Daily at ${time}`;
    case 'weekdays':
      return `Weekdays at ${time}`;
    case 'weekends':
      return `Weekends at ${time}`;
    case 'specific':
      const dayNames = (parsed.selectedDays || [])
        .sort((a, b) => a - b)
        .map(d => DAYS[d]?.label || d)
        .join(', ');
      return `${dayNames} at ${time}`;
    default:
      return cron;
  }
}

export default function SchedulesPage() {
  const [scheduleList, setScheduleList] = useState<ScheduleInfo[]>([]);
  const [workflowList, setWorkflowList] = useState<WorkflowInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [s, w] = await Promise.all([schedules.list(), workflows.list()]);
      setScheduleList(s);
      setWorkflowList(w);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startCreate = () => {
    setForm(emptyForm);
    setEditing('new');
    setError('');
  };

  const startEdit = (s: ScheduleInfo) => {
    const parsed = fromCron(s.cronExpression);
    setForm({
      workflowId: s.workflowId,
      hour: parsed.hour ?? 7,
      minute: parsed.minute ?? 0,
      frequency: parsed.frequency ?? 'daily',
      selectedDays: parsed.selectedDays ?? [1, 2, 3, 4, 5],
      timezone: s.timezone,
      isActive: s.isActive,
    });
    setEditing(s.id);
    setError('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.workflowId) {
      setError('Select a workflow.');
      return;
    }
    if (form.frequency === 'specific' && form.selectedDays.length === 0) {
      setError('Select at least one day.');
      return;
    }
    setSaving(true);
    setError('');
    const cronExpression = toCron(form);
    try {
      if (editing === 'new') {
        await schedules.create({
          workflowId: form.workflowId,
          cronExpression,
          timezone: form.timezone,
          isActive: form.isActive,
        });
      } else {
        await schedules.update(editing!, {
          cronExpression,
          timezone: form.timezone,
          isActive: form.isActive,
        });
      }
      cancelEdit();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (s: ScheduleInfo) => {
    try {
      await schedules.update(s.id, { isActive: !s.isActive });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await schedules.delete(id);
      setDeleting(null);
      if (editing === id) cancelEdit();
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const workflowName = (id: string) =>
    workflowList.find(w => w.id === id)?.name || id;

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleString() : '—';

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Schedules</h1>
        {!editing && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
          >
            + New Schedule
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editing === 'new' ? 'Create Schedule' : 'Edit Schedule'}
          </h2>
          <div className="space-y-4">
            {editing === 'new' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Workflow</label>
                <select
                  value={form.workflowId}
                  onChange={e => setForm({ ...form, workflowId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                >
                  <option value="">Select a workflow...</option>
                  {workflowList.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Time Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Run at</label>
              <div className="flex items-center gap-2">
                <select
                  value={form.hour}
                  onChange={e => setForm({ ...form, hour: parseInt(e.target.value, 10) })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                >
                  {Array.from({ length: 24 }, (_, i) => {
                    const period = i >= 12 ? 'PM' : 'AM';
                    const hour12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
                    return (
                      <option key={i} value={i}>
                        {hour12} {period}
                      </option>
                    );
                  })}
                </select>
                <span className="text-gray-500">:</span>
                <select
                  value={form.minute}
                  onChange={e => setForm({ ...form, minute: parseInt(e.target.value, 10) })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                    <option key={m} value={m}>
                      {m.toString().padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Frequency Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Repeat</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    checked={form.frequency === 'daily'}
                    onChange={() => setForm({ ...form, frequency: 'daily' })}
                    className="text-hive-500 focus:ring-hive-500"
                  />
                  <span className="text-sm">Every day</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    checked={form.frequency === 'weekdays'}
                    onChange={() => setForm({ ...form, frequency: 'weekdays' })}
                    className="text-hive-500 focus:ring-hive-500"
                  />
                  <span className="text-sm">Weekdays (Mon-Fri)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    checked={form.frequency === 'weekends'}
                    onChange={() => setForm({ ...form, frequency: 'weekends' })}
                    className="text-hive-500 focus:ring-hive-500"
                  />
                  <span className="text-sm">Weekends (Sat-Sun)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    checked={form.frequency === 'specific'}
                    onChange={() => setForm({ ...form, frequency: 'specific' })}
                    className="text-hive-500 focus:ring-hive-500"
                  />
                  <span className="text-sm">Specific days</span>
                </label>

                {form.frequency === 'specific' && (
                  <div className="flex gap-1 ml-6">
                    {DAYS.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          const has = form.selectedDays.includes(day.value);
                          setForm({
                            ...form,
                            selectedDays: has
                              ? form.selectedDays.filter(d => d !== day.value)
                              : [...form.selectedDays, day.value],
                          });
                        }}
                        className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                          form.selectedDays.includes(day.value)
                            ? 'bg-hive-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title={day.label}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <input
                type="text"
                value={form.timezone}
                onChange={e => setForm({ ...form, timezone: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="UTC"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-gray-300 text-hive-500 focus:ring-hive-500"
              />
              Active (schedule will trigger on cron ticks)
            </label>

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
      {scheduleList.length === 0 && !editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No schedules yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Create schedules to run workflows automatically on a cron schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduleList.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{workflowName(s.workflowId)}</h3>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {formatSchedule(s.cronExpression)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    <span>TZ: {s.timezone}</span>
                    <span>Last run: {formatDate(s.lastRunAt)}</span>
                    <span>Next run: {formatDate(s.nextRunAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(s)}
                    className={`text-sm transition-colors ${
                      s.isActive ? 'text-yellow-600 hover:text-yellow-700' : 'text-green-600 hover:text-green-700'
                    }`}
                  >
                    {s.isActive ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => startEdit(s)}
                    className="text-sm text-gray-500 hover:text-hive-600 transition-colors"
                  >
                    Edit
                  </button>
                  {deleting === s.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(s.id)}
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
                      onClick={() => setDeleting(s.id)}
                      className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
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
