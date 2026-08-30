import { Navigate, Outlet } from 'react-router-dom';

/**
 * Auth gate: redirects to /login when no token is stored.
 * Token presence is the MVP check — swapping in real JWT validation is
 * part of the Auth owner's ticket. Keep this component; replace its logic.
 */
export function RequireAuth() {
  const token = localStorage.getItem('rt_token');
  if (!token) {
    // --- DEV SHIM (assistant owner) — delete with the server's DEV_USER_ID shim ---
    // Login does not exist yet, so nothing can ever put a token in localStorage and every
    // protected route bounces to a /login page that cannot log anyone in. In dev only, let
    // the request through; the server's own DEV_USER_ID shim decides who the caller is.
    // `import.meta.env.DEV` is false in `vite build`, so production keeps the real gate.
    //
    // Auth owner: delete this block. The redirect below is the behaviour you want.
    if (import.meta.env.DEV) {
      return <Outlet />;
    }
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
