import { useState, useEffect } from 'react';
import { reminders, ReminderInfo } from '../api';

type Filter = 'active' | 'completed' | 'all';

function formatDueDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function isOverdue(item: ReminderInfo): boolean {
  return !!item.dueAt && !item.isComplete && new Date(item.dueAt) < new Date();
}

/** Convert an ISO string to a `datetime-local` input value (YYYY-MM-DDTHH:mm). */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RemindersPage() {
  const [items, setItems] = useState<ReminderInfo[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [newText, setNewText] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingDue, setEditingDue] = useState<string | null>(null);
  const [editDueValue, setEditDueValue] = useState('');

  useEffect(() => {
    loadReminders();
  }, [filter]);

  const loadReminders = async () => {
    try {
      const includeComplete = filter !== 'active';
      const data = await reminders.list(includeComplete);
      const filtered = filter === 'completed'
        ? data.filter(r => r.isComplete)
        : data;
      setItems(filtered);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    setError('');
    try {
      const dueAt = newDueAt ? new Date(newDueAt).toISOString() : undefined;
      await reminders.create(newText.trim(), dueAt);
      setNewText('');
      setNewDueAt('');
      await loadReminders();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item: ReminderInfo) => {
    try {
      await reminders.update(item.id, { isComplete: !item.isComplete });
      await loadReminders();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await reminders.delete(id);
      setDeleting(null);
      await loadReminders();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSetDue = async (id: string) => {
    try {
      const dueAt = editDueValue ? new Date(editDueValue).toISOString() : null;
      await reminders.update(id, { dueAt });
      setEditingDue(null);
      setEditDueValue('');
      await loadReminders();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEditingDue = (item: ReminderInfo) => {
    setEditingDue(item.id);
    setEditDueValue(item.dueAt ? toDatetimeLocal(item.dueAt) : '');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !adding) {
      handleAdd();
    }
  };

  const activeCount = items.filter(r => !r.isComplete).length;
  const completedCount = items.filter(r => r.isComplete).length;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reminders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your reminders. You can also add reminders by chatting with your assistant.
        </p>
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* Add reminder */}
      <div className="flex flex-col gap-2 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
            placeholder="Add a reminder..."
            disabled={adding}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
        <div className="flex items-center gap-2 pl-1">
          <label className="text-xs text-gray-500">Due:</label>
          <input
            type="datetime-local"
            value={newDueAt}
            onChange={e => setNewDueAt(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
            disabled={adding}
          />
          {newDueAt && (
            <button
              onClick={() => setNewDueAt('')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['active', 'all', 'completed'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              filter === f
                ? 'bg-white text-gray-900 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'active' ? `Active${activeCount > 0 ? ` (${activeCount})` : ''}` :
             f === 'completed' ? `Completed${completedCount > 0 ? ` (${completedCount})` : ''}` :
             'All'}
          </button>
        ))}
      </div>

      {/* Reminder list */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            {filter === 'active' ? 'No active reminders.' :
             filter === 'completed' ? 'No completed reminders.' :
             'No reminders yet.'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Add one above or tell your assistant "remind me about..."
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className={`bg-white rounded-xl border p-4 flex items-start gap-3 transition-colors ${
                item.isComplete ? 'opacity-60 border-gray-200' :
                isOverdue(item) ? 'border-red-300 bg-red-50/30' :
                'border-gray-200'
              }`}
            >
              <button
                onClick={() => handleToggle(item)}
                className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-colors ${
                  item.isComplete
                    ? 'bg-hive-500 border-hive-500 text-white'
                    : 'border-gray-300 hover:border-hive-400'
                }`}
              >
                {item.isComplete && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.isComplete ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                  {item.text}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">
                    Added {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  {item.dueAt && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className={`text-xs font-medium ${
                        item.isComplete ? 'text-gray-400' :
                        isOverdue(item) ? 'text-red-600' :
                        'text-amber-600'
                      }`}>
                        Due {formatDueDate(item.dueAt)}
                      </span>
                      {isOverdue(item) && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                          Overdue
                        </span>
                      )}
                    </>
                  )}
                  {item.notifiedAt && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-[10px] font-medium uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                        Notified
                      </span>
                    </>
                  )}
                  {item.completedAt && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">
                        Completed {new Date(item.completedAt).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>

                {/* Inline due date editor */}
                {editingDue === item.id && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="datetime-local"
                      value={editDueValue}
                      onChange={e => setEditDueValue(e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => handleSetDue(item.id)}
                      className="text-xs font-medium text-hive-600 hover:text-hive-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingDue(null); setEditDueValue(''); }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 flex items-center gap-2">
                {!item.isComplete && editingDue !== item.id && (
                  <button
                    onClick={() => startEditingDue(item)}
                    className="text-sm text-gray-400 hover:text-amber-600 transition-colors"
                    title={item.dueAt ? 'Change due date' : 'Set due date'}
                  >
                    {item.dueAt ? 'Edit due' : 'Set due'}
                  </button>
                )}
                {deleting === item.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(item.id)}
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
                    onClick={() => setDeleting(item.id)}
                    className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
