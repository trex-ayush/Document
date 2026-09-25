import AdminSettings from './admin/AdminSettings.jsx';

/**
 * Old top-level "Platform Settings" page (`/platform-settings`). The content now lives in
 * `pages/admin/AdminSettings.jsx` (Admin > Settings); this only adds the page padding the admin
 * layout would otherwise provide, so the old route keeps working until it redirects.
 */
export default function PlatformSettings() {
  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <AdminSettings standalone />
    </div>
  );
}
