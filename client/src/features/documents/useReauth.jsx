import { useCallback, useRef, useState } from 'react';
import { authApi } from '@/services/authApi.js';
import { documentsApi } from '@/services/documentsApi.js';
import ReauthModal from './ReauthModal.jsx';

const TOKEN_LIFETIME_MS = 4.5 * 60 * 1000; // server issues 5min tokens; refresh a little early

/**
 * Manages the "reveal a sensitive custom field" flow end-to-end, including
 * the reauth-required/retry dance from docs/API.md:
 *
 *   GET /documents/:id/fields/:fieldId/reveal
 *     -> 200 { value }                                    (reauth not required, or already satisfied)
 *     -> 401 { code: 'REAUTH_REQUIRED' }                   (Family.settings.requireReauthForSecrets is on)
 *
 * On `REAUTH_REQUIRED` this shows `ReauthModal`, exchanges the entered
 * password for a 5-minute `reauthToken` via `POST /auth/reauth`, retries the
 * reveal with `X-Reauth`, and **caches the token** for ~4.5 minutes so
 * revealing several fields (or the custom-fields editor's batch re-encrypt
 * on save — see `CustomFieldsEditor.jsx`) only prompts once.
 *
 * Usage:
 *   const { revealField, ReauthDialog } = useReauth();
 *   const value = await revealField(documentId, fieldId);
 *   return <>{content}<ReauthDialog /></>; // mount once per page that reveals fields
 */
export function useReauth() {
  const [pendingPrompt, setPendingPrompt] = useState(null); // { resolve, reject } | null
  const tokenRef = useRef(null);
  const expiryRef = useRef(0);

  const promptForPassword = useCallback(() => {
    return new Promise((resolve, reject) => {
      setPendingPrompt({ resolve, reject });
    });
  }, []);

  const getCachedToken = useCallback(() => {
    if (tokenRef.current && Date.now() < expiryRef.current) return tokenRef.current;
    return null;
  }, []);

  // If no valid cached token, opens ReauthModal and resolves once the user
  // submits a correct password (`handleReauthSubmit` below does the actual
  // `POST /auth/reauth` call and resolves this promise with the token).
  const acquireToken = useCallback(async () => {
    const cached = getCachedToken();
    if (cached) return cached;
    return promptForPassword();
  }, [getCachedToken, promptForPassword]);

  /** Reveals one field's plaintext, prompting for reauth only if/when the server asks for it. */
  const revealField = useCallback(
    async (documentId, fieldId) => {
      try {
        const { value } = await documentsApi.revealField(documentId, fieldId, getCachedToken());
        return value;
      } catch (err) {
        if (err?.response?.status === 401 && err?.response?.data?.code === 'REAUTH_REQUIRED') {
          const token = await acquireToken();
          const { value } = await documentsApi.revealField(documentId, fieldId, token);
          return value;
        }
        throw err;
      }
    },
    [acquireToken, getCachedToken],
  );

  const handleReauthSubmit = useCallback(
    async (password) => {
      const { reauthToken } = await authApi.reauth(password);
      tokenRef.current = reauthToken;
      expiryRef.current = Date.now() + TOKEN_LIFETIME_MS;
      pendingPrompt?.resolve(reauthToken);
      setPendingPrompt(null);
    },
    [pendingPrompt],
  );

  const handleReauthCancel = useCallback(() => {
    pendingPrompt?.reject(new Error('Reauth cancelled'));
    setPendingPrompt(null);
  }, [pendingPrompt]);

  const ReauthDialog = useCallback(
    () => <ReauthModal isOpen={Boolean(pendingPrompt)} onCancel={handleReauthCancel} onSubmit={handleReauthSubmit} />,
    [pendingPrompt, handleReauthCancel, handleReauthSubmit],
  );

  return { revealField, ReauthDialog };
}

export default useReauth;
