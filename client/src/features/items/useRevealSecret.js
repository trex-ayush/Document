import { useCallback, useRef, useState } from 'react';
import itemsApi from '@/services/itemsApi.js';
import { useReauth } from '@/features/share/ReauthPrompt.jsx';

// Matches the server's own reauth token TTL (server/src/utils/tokens.js#REAUTH_TOKEN_TTL) so the
// client never holds onto a capability the server would already consider stale.
const REAUTH_TTL_MS = 5 * 60 * 1000;

/**
 * Reveal-on-demand for one item's sensitive fields (docs/ITEMS.md "GET /items/:id/fields/:fieldId/
 * reveal"). `reveal(fieldId)` tries directly first — `Family.settings.requireReauthForSecrets` may
 * be off, in which case no prompt is ever needed — and only opens the shared reauth dialog
 * (`useReauth`, `client/src/features/share/ReauthPrompt.jsx`) on `401 REAUTH_REQUIRED`. The
 * resulting token is cached in-memory for 5 minutes so revealing several fields on the same item
 * (ItemEdit prefills every sensitive field before rendering the edit form) only prompts once.
 * Render `{reauthModal}` once wherever this hook is used.
 */
export function useRevealSecret(itemId) {
  const [values, setValues] = useState({}); // fieldId -> plaintext
  const [revealingId, setRevealingId] = useState(null);
  const { requestReauth, reauthModal } = useReauth();
  const reauthTokenRef = useRef(null);
  const reauthExpiresAtRef = useRef(0);

  const cachedReauthToken = () => {
    if (reauthTokenRef.current && Date.now() < reauthExpiresAtRef.current) return reauthTokenRef.current;
    return null;
  };

  const revealWithToken = useCallback(
    async (fieldId, reauthToken) => {
      setRevealingId(fieldId);
      try {
        const { value } = await itemsApi.revealField(itemId, fieldId, reauthToken);
        setValues((prev) => ({ ...prev, [fieldId]: value }));
        return value;
      } finally {
        setRevealingId(null);
      }
    },
    [itemId],
  );

  const reveal = useCallback(
    async (fieldId) => {
      try {
        return await revealWithToken(fieldId, cachedReauthToken());
      } catch (err) {
        if (err?.response?.data?.code !== 'REAUTH_REQUIRED') throw err;
        const reauthToken = await requestReauth('Confirm your password to reveal this sensitive value.');
        reauthTokenRef.current = reauthToken;
        reauthExpiresAtRef.current = Date.now() + REAUTH_TTL_MS;
        return revealWithToken(fieldId, reauthToken);
      }
    },
    [revealWithToken, requestReauth],
  );

  const hide = useCallback((fieldId) => {
    setValues((prev) => {
      if (!(fieldId in prev)) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  return { values, revealingId, reveal, hide, reauthModal };
}

export default useRevealSecret;
