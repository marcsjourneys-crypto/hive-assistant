import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/chat', label: 'Chat', icon: '💬' },
  { to: '/settings/soul', label: 'Personality', icon: '🎭' },
  { to: '/settings/profile', label: 'Profile', icon: '👤' },
  { to: '/settings/skills', label: 'Skills', icon: '⚡' },
  { to: '/settings/channels', label: 'Channels', icon: '📱' },
];

const adminItems = [
  { to: '/admin/users', label: 'Users', icon: '👥' },
  { to: '/admin/system', label: 'System', icon: '⚙️' },
  { to: '/admin/logs', label: 'Logs', icon: '📋' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-hive-400">Hive</h1>
          <p className="text-sm text-gray-400 mt-1">{user?.email}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {user?.isAdmin && (
            <>
              <div className="border-t border-gray-700 my-3" />
              <p className="text-xs text-gray-500 uppercase tracking-wider px-3 mb-2">Admin</p>
              {adminItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
