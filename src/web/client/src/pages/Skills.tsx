import { useState, useEffect } from 'react';
import { skills, SkillInfo } from '../api';
import { useAuth } from '../auth-context';

interface SkillForm {
  name: string;
  description: string;
  content: string;
  isShared: boolean;
}

const emptyForm: SkillForm = { name: '', description: '', content: '', isShared: false };

export default function Skills() {
  const { user } = useAuth();
  const [skillList, setSkillList] = useState<SkillInfo[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editing, setEditing] = useState<string | null>(null); // skill id or 'new'
  const [form, setForm] = useState<SkillForm>(emptyForm);

  // Delete confirmation
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const data = await skills.list();
      setSkillList(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startCreate = () => {
    setForm(emptyForm);
    setEditing('new');
    setError('');
  };

  const startEdit = async (id: string) => {
    try {
      setError('');
      const skill = await skills.get(id);
      setForm({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        isShared: skill.isShared,
      });
      setEditing(id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) {
      setError('Name and content are required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await skills.create(form);
      } else {
        await skills.update(editing!, form);
      }
      setEditing(null);
      setForm(emptyForm);
      await loadSkills();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await skills.delete(id);
      setDeleting(null);
      if (editing === id) {
        setEditing(null);
        setForm(emptyForm);
      }
      await loadSkills();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const isOwner = (skill: SkillInfo) => skill.ownerId === user?.userId;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Skills</h1>
        {!editing && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
          >
            + New Skill
          </button>
        )}
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* Editor Panel */}
      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editing === 'new' ? 'Create Skill' : 'Edit Skill'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="e.g., summarize-data"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="What does this skill do?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Content
                <span className="text-gray-400 font-normal ml-1">(instructions for the AI)</span>
              </label>
              <textarea
                value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })}
                rows={10}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="You are a data summarizer. When given data, you should..."
              />
            </div>
            {user?.isAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isShared}
                  onChange={e => setForm({ ...form, isShared: e.target.checked })}
                  className="rounded border-gray-300 text-hive-500 focus:ring-hive-500"
                />
                Share with all users
              </label>
            )}
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

      {/* Skills List */}
      {skillList.length === 0 && !editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No skills yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Create your first skill to give your assistant new capabilities.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {skillList.map(skill => (
            <div
              key={skill.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{skill.name}</h3>
                  {skill.description && (
                    <p className="text-sm text-gray-500 mt-1">{skill.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {skill.isShared && (
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      Shared
                    </span>
                  )}
                  {(isOwner(skill) || user?.isAdmin) && (
                    <>
                      <button
                        onClick={() => startEdit(skill.id)}
                        className="text-sm text-gray-500 hover:text-hive-600 transition-colors"
                      >
                        Edit
                      </button>
                      {deleting === skill.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(skill.id)}
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
                          onClick={() => setDeleting(skill.id)}
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
