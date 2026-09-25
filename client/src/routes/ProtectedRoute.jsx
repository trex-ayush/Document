import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import { AppShellSkeleton } from '@/components/ui/Skeleton.jsx';

/**
 * ProtectedRoute — route guard. Redirects to `/login` (preserving the
 * attempted location in `state.from`, so Login can send the user back after
 * signing in) once `loading` is false and `isAuthenticated` is false. Shows
 * an app-shell skeleton (navbar, sidebar / tab bar, page placeholder) while the initial `GET /auth/me` validation
 * (AuthContext's mount effect) is still in flight, so an authenticated user
 * refreshing the page never flashes the login screen.
 *
 * Works both as a wrapper (`<ProtectedRoute><AppShell /></ProtectedRoute>`)
 * and as a layout route element rendering `<Outlet/>` when used with
 * `element={<ProtectedRoute />}` + `children` in the router config — use
 * whichever fits the route tree shape; both are supported.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, memberships } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AppShellSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Multi-family accounts (docs/API.md "Multi-family sessions"): a cold signup/login with no
  // auto-joined invite lands with zero memberships. Send them to onboarding ("create your
  // family") before anything that assumes an active family (AppShell's nav, any family-scoped
  // page) ever renders. Onboarding itself isn't wrapped in ProtectedRoute (no AppShell chrome to
  // show yet), so this can't loop.
  if (memberships.length === 0 && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return children ?? <Outlet />;
}
