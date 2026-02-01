import { useState, useEffect } from 'react';
import { schedules, workflows, ScheduleInfo, WorkflowInfo } from '../api';

interface ScheduleForm {
  workflowId: string;
  cronExpression: string;
  timezone: string;
  isActive: boolean;
}

const emptyForm: ScheduleForm = {
  workflowId: '',
  cronExpression: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  isActive: true,
};

const cronPresets = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 7 AM', value: '0 7 * * *' },
  { label: 'Weekdays at 7 AM', value: '0 7 * * 1-5' },
  { label: 'Every Monday at 9 AM', value: '0 9 * * 1' },
  { label: 'First of month at 8 AM', value: '0 8 1 * *' },
];

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
    setForm({
      workflowId: s.workflowId,
      cronExpression: s.cronExpression,
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
    if (!form.cronExpression.trim()) {
      setError('Cron expression is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await schedules.create(form);
      } else {
        await schedules.update(editing!, {
          cronExpression: form.cronExpression,
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cron Expression
                <span className="text-gray-400 font-normal ml-1">(minute hour day month weekday)</span>
              </label>
              <input
                type="text"
                value={form.cronExpression}
                onChange={e => setForm({ ...form, cronExpression: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="0 7 * * 1-5"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {cronPresets.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setForm({ ...form, cronExpression: p.value })}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
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
                    <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                      {s.cronExpression}
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
