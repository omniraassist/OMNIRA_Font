import { Navigate, Route, Routes } from 'react-router-dom';
import { useAdminAuth } from './context/AdminAuthContext.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { PaidUsersPage } from './pages/PaidUsersPage.jsx';
import { SessionsPage } from './pages/SessionsPage.jsx';
import { WhatsAppSettingsPage } from './pages/WhatsAppSettingsPage.jsx';
import { ClientDetailPage } from './pages/ClientDetailPage.jsx';
import { LeadsPage } from './pages/LeadsPage.jsx';
import { ChatsPage } from './pages/ChatsPage.jsx';
import { PricingPage } from './pages/PricingPage.jsx';
import { BotConfigPage } from './pages/BotConfigPage.jsx';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAdminAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="clients" element={<PaidUsersPage />} />
        <Route path="clients/:clientId" element={<ClientDetailPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="chats" element={<ChatsPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="bot-config" element={<BotConfigPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="whatsapp" element={<WhatsAppSettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}