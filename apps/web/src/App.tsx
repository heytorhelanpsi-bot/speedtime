import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AlertsPage } from './pages/Alerts';
import { DashboardPage } from './pages/Dashboard';
import { LoginPage } from './pages/Login';
import { SettingsPage } from './pages/Settings';

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="muted flex min-h-dvh items-center justify-center text-sm">Carregando…</div>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/item/:id" element={<DashboardPage />} />
      <Route path="/search" element={<DashboardPage search />} />
      <Route path="/alerts" element={<AlertsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
