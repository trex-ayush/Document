import { useAuth } from '@/context/AuthContext.jsx';

/**
 * Whether the signed-in person may add, change, delete and share in the active family.
 * A member with view-only access (`access: 'read'`) can open and download everything but the
 * server refuses every change (`requireWrite`), so the app hides those buttons instead of
 * letting them fail. Unknown (still loading) counts as allowed, so nothing flickers away.
 */
export function useCanWrite() {
  const { membership } = useAuth();
  return membership?.access !== 'read';
}
