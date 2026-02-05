import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import SoulEditor from './pages/SoulEditor';
import ProfileEditor from './pages/ProfileEditor';
import Skills from './pages/Skills';
import ScriptsPage from './pages/Scripts';
import WorkflowsPage from './pages/Workflows';
import SchedulesPage from './pages/Schedules';
import CredentialsPage from './pages/Credentials';
import Channels from './pages/Channels';
import ChannelIdentitiesPage from './pages/ChannelIdentities';
import RemindersPage from './pages/Reminders';
import ContactsPage from './pages/Contacts';
import FilesPage from './pages/Files';
import TemplatesPage from './pages/Templates';
import ToolsPage from './pages/Tools';
import IntegrationsPage from './pages/Integrations';
import Users from './pages/admin/Users';
import System from './pages/admin/System';
import Logs from './pages/admin/Logs';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="chat" element={<Chat />} />
        <Route path="settings/soul" element={<SoulEditor />} />
        <Route path="settings/profile" element={<ProfileEditor />} />
        <Route path="settings/skills" element={<Skills />} />
        <Route path="settings/channels" element={<Channels />} />
        <Route path="settings/identities" element={<ChannelIdentitiesPage />} />
        <Route path="settings/reminders" element={<RemindersPage />} />
        <Route path="settings/contacts" element={<ContactsPage />} />
        <Route path="settings/files" element={<FilesPage />} />
        <Route path="settings/integrations" element={<IntegrationsPage />} />
        <Route path="automation/templates" element={<TemplatesPage />} />
        <Route path="automation/scripts" element={<ScriptsPage />} />
        <Route path="automation/workflows" element={<WorkflowsPage />} />
        <Route path="automation/schedules" element={<SchedulesPage />} />
        <Route path="automation/credentials" element={<CredentialsPage />} />
        <Route path="automation/tools" element={<ToolsPage />} />

        <Route path="admin/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="admin/system" element={<AdminRoute><System /></AdminRoute>} />
        <Route path="admin/logs" element={<AdminRoute><Logs /></AdminRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
