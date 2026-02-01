import { useState, useEffect } from 'react';
import { reminders, ReminderInfo } from '../api';

type Filter = 'active' | 'completed' | 'all';

export default function RemindersPage() {
  const [items, setItems] = useState<ReminderInfo[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [newText, setNewText] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
      await reminders.create(newText.trim());
      setNewText('');
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
      <div className="flex gap-3 mb-6">
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
              className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 transition-colors ${
                item.isComplete ? 'opacity-60' : ''
              }`}
            >
              <button
                onClick={() => handleToggle(item)}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
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
                <p className="text-xs text-gray-400 mt-0.5">
                  Added {new Date(item.createdAt).toLocaleDateString()}
                  {item.completedAt && ` · Completed ${new Date(item.completedAt).toLocaleDateString()}`}
                </p>
              </div>

              <div className="flex-shrink-0">
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
