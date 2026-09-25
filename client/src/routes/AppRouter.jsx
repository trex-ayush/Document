import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import AppShell from '../components/layout/AppShell.jsx';
import Spinner from '../components/ui/Spinner.jsx';

// Every page is a default export, loaded on demand.
const Login = lazy(() => import('../pages/auth/Login.jsx'));
const Signup = lazy(() => import('../pages/auth/Signup.jsx'));
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../pages/auth/ResetPassword.jsx'));
const AcceptInvite = lazy(() => import('../pages/auth/AcceptInvite.jsx'));
const Onboarding = lazy(() => import('../pages/Onboarding.jsx'));
const PublicShare = lazy(() => import('../pages/PublicShare.jsx'));
const NotFound = lazy(() => import('../pages/NotFound.jsx'));

const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));
const Browse = lazy(() => import('../pages/Browse.jsx'));
const AddDocument = lazy(() => import('../pages/add/AddDocument.jsx'));
const AddPassword = lazy(() => import('../pages/add/AddPassword.jsx'));
const AddNote = lazy(() => import('../pages/add/AddNote.jsx'));
const DocumentDetail = lazy(() => import('../pages/DocumentDetail.jsx'));
const ItemDetail = lazy(() => import('../pages/items/ItemDetail.jsx'));
const ItemEdit = lazy(() => import('../pages/items/ItemEdit.jsx'));
const Search = lazy(() => import('../pages/Search.jsx'));
const ResizeToolPage = lazy(() => import('../pages/ResizeToolPage.jsx'));
const Shares = lazy(() => import('../pages/Shares.jsx'));
const Members = lazy(() => import('../pages/Members.jsx'));
const Activity = lazy(() => import('../pages/Activity.jsx'));
const Bin = lazy(() => import('../pages/Bin.jsx'));
const Settings = lazy(() => import('../pages/Settings.jsx'));
// Admin panel (docs/ADMIN_API.md) — a layout with tabs and one page per tab.
const AdminLayout = lazy(() => import('../pages/admin/AdminLayout.jsx'));
const AdminOverview = lazy(() => import('../pages/admin/AdminOverview.jsx'));
const AdminUsers = lazy(() => import('../pages/admin/AdminUsers.jsx'));
const AdminFamilies = lazy(() => import('../pages/admin/AdminFamilies.jsx'));
const AdminActivity = lazy(() => import('../pages/admin/AdminActivity.jsx'));
const AdminShares = lazy(() => import('../pages/admin/AdminShares.jsx'));
const AdminAdmins = lazy(() => import('../pages/admin/AdminAdmins.jsx'));
const AdminSettings = lazy(() => import('../pages/admin/AdminSettings.jsx'));
const AdminSystem = lazy(() => import('../pages/admin/AdminSystem.jsx'));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

function withSuspense(element) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>;
}

export const routes = [
  { path: '/login', element: withSuspense(<Login />) },
  { path: '/signup', element: withSuspense(<Signup />) },
  { path: '/forgot-password', element: withSuspense(<ForgotPassword />) },
  { path: '/reset-password', element: withSuspense(<ResetPassword />) },
  { path: '/accept-invite', element: withSuspense(<AcceptInvite />) },
  { path: '/onboarding', element: withSuspense(<Onboarding />) },
  { path: '/s/:token', element: withSuspense(<PublicShare />) },

  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: withSuspense(<Dashboard />) },
      { path: 'browse', element: withSuspense(<Browse />) },
      { path: 'browse/:folderId', element: withSuspense(<Browse />) },
      // ?folderId=<id> to add into a folder; ?capture=1 opens the camera.
      { path: 'add/document', element: withSuspense(<AddDocument />) },
      { path: 'add/password', element: withSuspense(<AddPassword />) },
      { path: 'add/note', element: withSuspense(<AddNote />) },
      { path: 'documents/:id', element: withSuspense(<DocumentDetail />) },
      { path: 'items/:id', element: withSuspense(<ItemDetail />) },
      { path: 'items/:id/edit', element: withSuspense(<ItemEdit />) },
      { path: 'search', element: withSuspense(<Search />) },
      { path: 'tools/resize', element: withSuspense(<ResizeToolPage />) },
      { path: 'shares', element: withSuspense(<Shares />) },
      { path: 'members', element: withSuspense(<Members />) },
      { path: 'activity', element: withSuspense(<Activity />) },
      { path: 'bin', element: withSuspense(<Bin />) },
      { path: 'settings/*', element: withSuspense(<Settings />) },
      {
        path: 'admin',
        element: withSuspense(<AdminLayout />),
        children: [
          { index: true, element: withSuspense(<AdminOverview />) },
          { path: 'users', element: withSuspense(<AdminUsers />) },
          { path: 'families', element: withSuspense(<AdminFamilies />) },
          { path: 'activity', element: withSuspense(<AdminActivity />) },
          { path: 'shares', element: withSuspense(<AdminShares />) },
          { path: 'admins', element: withSuspense(<AdminAdmins />) },
          { path: 'settings', element: withSuspense(<AdminSettings />) },
          { path: 'system', element: withSuspense(<AdminSystem />) },
        ],
      },
      // The old Platform Settings page now lives under the admin panel.
      { path: 'platform-settings', element: <Navigate to="/admin/settings" replace /> },
    ],
  },

  { path: '*', element: withSuspense(<NotFound />) },
];

const router = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
