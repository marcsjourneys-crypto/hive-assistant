import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SoulEditor from './pages/SoulEditor';
import ProfileEditor from './pages/ProfileEditor';
import Skills from './pages/Skills';
import Channels from './pages/Channels';
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
        <Route path="settings/soul" element={<SoulEditor />} />
        <Route path="settings/profile" element={<ProfileEditor />} />
        <Route path="settings/skills" element={<Skills />} />
        <Route path="settings/channels" element={<Channels />} />

        <Route path="admin/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="admin/system" element={<AdminRoute><System /></AdminRoute>} />
        <Route path="admin/logs" element={<AdminRoute><Logs /></AdminRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
