import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import Spinner from '@/components/ui/Spinner.jsx';

/**
 * ProtectedRoute — route guard. Redirects to `/login` (preserving the
 * attempted location in `state.from`, so Login can send the user back after
 * signing in) once `loading` is false and `isAuthenticated` is false. Shows
 * a full-page spinner while the initial `GET /auth/me` validation
 * (AuthContext's mount effect) is still in flight, so an authenticated user
 * refreshing the page never flashes the login screen.
 *
 * Works both as a wrapper (`<ProtectedRoute><AppShell /></ProtectedRoute>`)
 * and as a layout route element rendering `<Outlet/>` when used with
 * `element={<ProtectedRoute />}` + `children` in the router config — use
 * whichever fits the route tree shape; both are supported.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children ?? <Outlet />;
}
