import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { Login } from './components/auth/Login.jsx';
import { Register } from './components/auth/Register.jsx';
import { Forgot } from './components/auth/Forgot.jsx';
import { PlanHome } from './components/onboarding/PlanHome.jsx';
import { PaymentStep } from './components/onboarding/PaymentStep.jsx';
import { TwilioAssigning } from './components/onboarding/TwilioAssigning.jsx';
import { Dashboard } from './components/dashboard/Dashboard.jsx';

function getSession() {
  try { return JSON.parse(localStorage.getItem('omnira_session') || '{}'); } catch { return {}; }
}

/** Redirect logged-out users to /login. */
function ProtectedRoute({ children }) {
  const sess = getSession();
  return sess?.token ? children : <Navigate to="/login" replace />;
}

/** Redirect already-logged-in users away from auth screens. */
function GuestRoute({ children }) {
  const sess = getSession();
  if (!sess?.token) return children;
  return <Navigate to={sess.user?.subscriptionActive ? '/dashboard' : '/plans'} replace />;
}

/** Handles Stripe Checkout redirect back to the app (?checkout=success&session_id=…). */
function StripeReturnCatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout  = params.get('checkout');
    const sessionId = params.get('session_id');
    if (checkout === 'success' && sessionId) {
      sessionStorage.setItem('omnira_pending_checkout', sessionId);
      window.history.replaceState({}, '', window.location.pathname);
      navigate('/payment?confirming=1', { replace: true });
    } else if (checkout === 'canceled') {
      window.history.replaceState({}, '', window.location.pathname);
      navigate('/payment?canceled=1', { replace: true });
    }
  }, [navigate]);
  return null;
}

function RootRedirect() {
  const sess = getSession();
  if (!sess?.token) return <Navigate to="/login" replace />;
  return <Navigate to={sess.user?.subscriptionActive ? '/dashboard' : '/plans'} replace />;
}

function AppRoutes() {
  return (
    <AuthProvider>
      <StripeReturnCatcher />
      <Routes>
        <Route path="/login"      element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/register"   element={<GuestRoute><Register /></GuestRoute>} />
        <Route path="/forgot"     element={<Forgot />} />
        <Route path="/plans"      element={<ProtectedRoute><PlanHome /></ProtectedRoute>} />
        <Route path="/payment"    element={<ProtectedRoute><PaymentStep /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><TwilioAssigning /></ProtectedRoute>} />
        <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="*"           element={<RootRedirect />} />
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
