import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { NavigationProvider } from './lib/NavigationContext';

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const BalancesPage = lazy(() => import('./pages/BalancesPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const JoinRequestPage = lazy(() => import('./pages/JoinRequestPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
      <div className="spinner" style={{ width: '28px', height: '28px' }} />
    </div>
  );
}

export default function App() {
  return (
    <NavigationProvider>
      <Suspense fallback={<PageFallback />}>
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
            element={<JoinRequestPage />}
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </NavigationProvider>
  );
}
