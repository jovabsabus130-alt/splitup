import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { NavigationProvider } from './lib/NavigationContext';
import AnalyticsPage from './pages/AnalyticsPage';
import BalancesPage from './pages/BalancesPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import GroupDetailPage from './pages/GroupDetailPage';
import HistoryPage from './pages/HistoryPage';
import JoinRequestPage from './pages/JoinRequestPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';

export default function App() {
  return (
    <NavigationProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
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
          path="/analytics"
          element={
            <ProtectedRoute>
              <AppLayout>
                <AnalyticsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HistoryPage />
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
    </NavigationProvider>
  );
}
