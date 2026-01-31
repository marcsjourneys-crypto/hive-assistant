import { useState, useEffect } from 'react';
import { admin, AdminUser } from '../../api';
import { useAuth } from '../../auth-context';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await admin.users();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      await admin.setRole(userId, isAdmin);
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await admin.deleteUser(userId);
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString() : 'Never';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">User Management</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-5 py-3 text-sm font-medium text-gray-500">Email</th>
              <th className="text-left px-5 py-3 text-sm font-medium text-gray-500">Role</th>
              <th className="text-left px-5 py-3 text-sm font-medium text-gray-500">Last Login</th>
              <th className="text-left px-5 py-3 text-sm font-medium text-gray-500">Joined</th>
              <th className="text-right px-5 py-3 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.userId}>
                <td className="px-5 py-3 text-sm">
                  {u.email}
                  {u.userId === currentUser?.userId && (
                    <span className="ml-2 text-xs text-gray-400">(you)</span>
                  )}
                </td>
                <td className="px-5 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    u.isAdmin ? 'bg-hive-100 text-hive-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {u.isAdmin ? 'Admin' : 'Member'}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-500">{formatDate(u.lastLogin)}</td>
                <td className="px-5 py-3 text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                <td className="px-5 py-3 text-sm text-right">
                  {u.userId !== currentUser?.userId && (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleAdmin(u.userId, !u.isAdmin)}
                        className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        {u.isAdmin ? 'Remove admin' : 'Make admin'}
                      </button>
                      <button
                        onClick={() => deleteUser(u.userId, u.email)}
                        className="text-xs px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="p-8 text-center text-gray-400">No users found.</div>
        )}
      </div>
    </div>
  );
}
