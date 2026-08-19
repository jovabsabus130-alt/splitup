import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import BalancesPage from './pages/BalancesPage';
import DashboardPage from './pages/DashboardPage';
import GroupDetailPage from './pages/GroupDetailPage';
import JoinRequestPage from './pages/JoinRequestPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups/:groupId"
        element={
          <ProtectedRoute>
            <AppLayout>
              <GroupDetailPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId"
        element={
          <ProtectedRoute>
            <AppLayout>
              <GroupDetailPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups/:groupId/balances"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BalancesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/group/:groupId/balances"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BalancesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/join/:groupId"
        element={
          <ProtectedRoute>
            <JoinRequestPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
