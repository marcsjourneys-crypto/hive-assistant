import { useState, useEffect } from 'react';
import { contacts, ContactInfo } from '../api';

export default function ContactsPage() {
  const [items, setItems] = useState<ContactInfo[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const data = await contacts.list();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSearch = async () => {
    if (!search.trim()) {
      await loadContacts();
      return;
    }
    try {
      const data = await contacts.search(search.trim());
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const resetForm = () => {
    setFormName('');
    setFormNickname('');
    setFormEmail('');
    setFormPhone('');
    setFormOrg('');
    setFormNotes('');
  };

  const handleAdd = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await contacts.create({
        name: formName.trim(),
        nickname: formNickname.trim() || undefined,
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        organization: formOrg.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      resetForm();
      setShowForm(false);
      await loadContacts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ContactInfo) => {
    setEditing(item.id);
    setFormName(item.name);
    setFormNickname(item.nickname || '');
    setFormEmail(item.email || '');
    setFormPhone(item.phone || '');
    setFormOrg(item.organization || '');
    setFormNotes(item.notes || '');
  };

  const cancelEdit = () => {
    setEditing(null);
    resetForm();
  };

  const handleUpdate = async (id: string) => {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await contacts.update(id, {
        name: formName.trim(),
        nickname: formNickname.trim() || undefined,
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        organization: formOrg.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
      setEditing(null);
      resetForm();
      await loadContacts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await contacts.delete(id);
      setDeleting(null);
      await loadContacts();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filtered = items;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-sm text-gray-500 mt-1">
          People you communicate with frequently. Your assistant uses these to resolve names in commands like "email Kai."
        </p>
      </div>

      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-2">&times;</button>
        </div>
      )}

      {/* Search + Add */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
          placeholder="Search contacts..."
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            onClick={() => { setSearch(''); loadContacts(); }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => { setShowForm(!showForm); if (editing) cancelEdit(); }}
          className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Contact'}
        </button>
      </div>

      {/* Add contact form */}
      {showForm && !editing && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">New Contact</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="Kai"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nickname</label>
              <input
                type="text"
                value={formNickname}
                onChange={e => setFormNickname(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="K"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="kai@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input
                type="tel"
                value={formPhone}
                onChange={e => setFormPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="+1-555-123-4567"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Organization</label>
              <input
                type="text"
                value={formOrg}
                onChange={e => setFormOrg(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                placeholder="Prefers text over email"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !formName.trim()}
              className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </div>
      )}

      {/* Contacts list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            {search ? 'No contacts match your search.' : 'No contacts yet.'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            {search
              ? 'Try a different search term.'
              : 'Add people you communicate with frequently so your assistant can resolve names automatically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id}>
              {editing === item.id ? (
                /* Inline edit form */
                <div className="bg-white rounded-xl border border-hive-300 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Edit Contact</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name *</label>
                      <input
                        type="text"
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Nickname</label>
                      <input
                        type="text"
                        value={formNickname}
                        onChange={e => setFormNickname(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={e => setFormEmail(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={e => setFormPhone(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Organization</label>
                      <input
                        type="text"
                        value={formOrg}
                        onChange={e => setFormOrg(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Notes</label>
                      <input
                        type="text"
                        value={formNotes}
                        onChange={e => setFormNotes(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hive-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdate(item.id)}
                      disabled={saving || !formName.trim()}
                      className="px-4 py-2 bg-hive-500 text-white rounded-lg text-sm font-medium hover:bg-hive-600 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Contact card */
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-hive-100 text-hive-700 flex items-center justify-center font-semibold text-sm">
                    {item.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      {item.nickname && (
                        <span className="text-xs text-gray-400">aka {item.nickname}</span>
                      )}
                      {item.organization && (
                        <span className="text-xs text-gray-400">· {item.organization}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {item.email && (
                        <span className="text-xs text-gray-500">{item.email}</span>
                      )}
                      {item.phone && (
                        <span className="text-xs text-gray-500">{item.phone}</span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic">{item.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-sm text-gray-400 hover:text-hive-600 transition-colors"
                    >
                      Edit
                    </button>
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
