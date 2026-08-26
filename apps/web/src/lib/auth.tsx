import { Navigate, Outlet } from 'react-router-dom';

/**
 * Auth gate: redirects to /login when no token is stored.
 * Token presence is the MVP check — swapping in real JWT validation is
 * part of the Auth owner's ticket. Keep this component; replace its logic.
 */
export function RequireAuth() {
  const token = localStorage.getItem('rt_token');
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
