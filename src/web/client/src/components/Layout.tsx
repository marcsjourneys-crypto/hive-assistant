import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';

// Main items (no section header)
const mainItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/chat', label: 'Chat', icon: '💬' },
];

// Section: My Assistant
const assistantItems = [
  { to: '/settings/soul', label: 'Personality', icon: '🎭' },
  { to: '/settings/skills', label: 'Skills', icon: '⚡' },
];

// Section: My Profile
const profileItems = [
  { to: '/settings/profile', label: 'Profile', icon: '👤' },
  { to: '/settings/contacts', label: 'Contacts', icon: '📇' },
  { to: '/settings/files', label: 'Files', icon: '📁' },
  { to: '/settings/reminders', label: 'Reminders', icon: '✅' },
];

// Section: Connections
const connectionsItems = [
  { to: '/settings/channels', label: 'Channels', icon: '📱' },
  { to: '/settings/identities', label: 'Identities', icon: '🔗' },
  { to: '/settings/integrations', label: 'Integrations', icon: '🔌' },
];

// Section: Automation
const automationItems = [
  { to: '/automation/workflows', label: 'Workflows', icon: '🔗' },
  { to: '/automation/schedules', label: 'Schedules', icon: '⏰' },
  { to: '/automation/credentials', label: 'Credentials', icon: '🔑' },
];

// Section: Admin (admin only) - includes Scripts
const adminItems = [
  { to: '/admin/users', label: 'Users', icon: '👥' },
  { to: '/admin/system', label: 'System', icon: '⚙️' },
  { to: '/automation/scripts', label: 'Scripts', icon: '🐍' },
  { to: '/admin/logs', label: 'Logs', icon: '📋' },
];

// Reusable NavLink component
function NavItem({ to, label, icon, end }: { to: string; label: string; icon: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-white/20 text-white'
            : 'text-white/80 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <span>{icon}</span>
      {label}
    </NavLink>
  );
}

// Section header component
function SectionHeader({ label }: { label: string }) {
  return (
    <>
      <div className="border-t border-white/10 my-3" />
      <p className="text-[10px] text-white/50 uppercase tracking-wider px-3 mb-2 font-semibold">
        {label}
      </p>
    </>
  );
}

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
      <aside className="w-64 bg-[#1e3a3a] text-white flex flex-col">
        <div className="p-4 border-b border-white/10">
          <img src="/hive.png" alt="Hive" className="w-full max-w-[200px] mx-auto mb-3" />
          <p className="text-sm text-white/70 text-center">{user?.email}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {/* Main items */}
          {mainItems.map(item => (
            <NavItem key={item.to} {...item} end={item.to === '/'} />
          ))}

          {/* My Assistant section */}
          <SectionHeader label="My Assistant" />
          {assistantItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}

          {/* My Profile section */}
          <SectionHeader label="My Profile" />
          {profileItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}

          {/* Connections section */}
          <SectionHeader label="Connections" />
          {connectionsItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}

          {/* Automation section */}
          <SectionHeader label="Automation" />
          {automationItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}

          {/* Admin section (admin only) */}
          {user?.isAdmin && (
            <>
              <SectionHeader label="Admin" />
              {adminItems.map(item => (
                <NavItem key={item.to} {...item} />
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
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
