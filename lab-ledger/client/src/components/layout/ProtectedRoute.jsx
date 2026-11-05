import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { useMeta } from '../../context/MetaContext';

/** Redirects unauthenticated users to /login, remembering where they were going (Req 13.1). */
export function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** Renders children for the Superuser role only; others are sent to the dashboard. */
export function SuperuserOnly({ children }) {
  const { isSuperuser } = usePermission();
  const { loading } = useMeta();
  if (loading) return null; // roles unknown until meta loads — don't redirect prematurely
  return isSuperuser ? children : <Navigate to="/" replace />;
}
