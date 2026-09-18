import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';

const isClerkConfigured = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

function ClerkProtectedWrapper({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const token = localStorage.getItem('splitup_token') || localStorage.getItem('token');

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
        <div className="spinner" style={{ width: '28px', height: '28px' }} />
      </div>
    );
  }

  if (!isSignedIn && !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function StandardProtectedWrapper({ children }) {
  const token = localStorage.getItem('splitup_token') || localStorage.getItem('token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default function ProtectedRoute({ children }) {
  if (isClerkConfigured) {
    return <ClerkProtectedWrapper>{children}</ClerkProtectedWrapper>;
  }
  return <StandardProtectedWrapper>{children}</StandardProtectedWrapper>;
}

