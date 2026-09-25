/**
 * Human-readable labels for `Activity.action` codes (docs/API.md "Activity &
 * Stats" — `{ id, actorName, action, targetType, targetId, ... }`). Built
 * from every `logActivity(..., { action: '...' })` call site across the
 * server (grepped, not hand-guessed) so the Activity page never shows a raw
 * `document.file.add`-style code to a user. Unknown/future codes still
 * render sensibly via `labelForAction`'s fallback.
 *
 * This is plain JS (a lookup object/functions), not a component, so it can't
 * call `useTranslation()` itself — `t` (from the caller's own
 * `useTranslation('activity')`) is threaded through every lookup instead,
 * matching this codebase's existing pattern of passing `t` into render
 * logic. Callers that don't have a `t` handy (or call these outside React)
 * still get the English fallback text.
 *
 * `key` below is the i18next key suffix shared by two sections of
 * `activity.json`:
 *  - `actions.<key>` — a short, standalone label ("Uploaded a document")
 *    used in the action-type filter dropdown (ActivityFilters), where
 *    there's no actor name to attach the label to.
 *  - `continuations.<key>` — the tail end of the activity-feed sentence
 *    ("uploaded a document"), appended after the bolded actor name in
 *    ActivityRow ("Priya" + " " + "uploaded a document"). Hindi needs this
 *    as genuinely different text from `actions.<key>` (not just a
 *    lowercased copy) because a transitive past-tense verb there takes the
 *    ergative "ने" marker right after the subject — "प्रिया ने दस्तावेज़
 *    अपलोड किया", never "प्रिया दस्तावेज़ अपलोड किया ने". So the Hindi
 *    continuation strings are written as "ने ..." fragments that read
 *    correctly once glued onto the name, while the Hindi action strings use
 *    a subject-free infinitive form ("दस्तावेज़ अपलोड करना") that reads fine
 *    on its own in the dropdown.
 */
export const ACTION_LABELS = {
  'auth.login': { key: 'authLogin', fallback: 'Signed in', continuationFallback: 'signed in' },
  'auth.login_failed': { key: 'authLoginFailed', fallback: 'Failed sign-in attempt', continuationFallback: 'made a failed sign-in attempt' },
  'auth.logout': { key: 'authLogout', fallback: 'Signed out', continuationFallback: 'signed out' },
  'auth.logout_all': { key: 'authLogoutAll', fallback: 'Signed out of all devices', continuationFallback: 'signed out of all devices' },
  'auth.signup': { key: 'authSignup', fallback: 'Created the family vault', continuationFallback: 'created the family vault' },
  'auth.change_password': { key: 'authChangePassword', fallback: 'Changed password', continuationFallback: 'changed password' },
  'auth.reset_password': { key: 'authResetPassword', fallback: 'Reset password', continuationFallback: 'reset password' },
  'auth.forgot_password': { key: 'authForgotPassword', fallback: 'Requested a password reset', continuationFallback: 'requested a password reset' },
  'auth.set_password': { key: 'authSetPassword', fallback: 'Set a password', continuationFallback: 'set a password' },
  'document.create': { key: 'documentCreate', fallback: 'Uploaded a document', continuationFallback: 'uploaded a document' },
  'document.update': { key: 'documentUpdate', fallback: 'Updated a document', continuationFallback: 'updated a document' },
  'document.delete': { key: 'documentDelete', fallback: 'Moved a document to the Bin', continuationFallback: 'moved a document to the Bin' },
  'document.restore': { key: 'documentRestore', fallback: 'Restored a document from the bin', continuationFallback: 'restored a document from the bin' },
  'document.view': { key: 'documentView', fallback: 'Viewed a document', continuationFallback: 'viewed a document' },
  'document.file.add': { key: 'documentFileAdd', fallback: 'Added a file', continuationFallback: 'added a file' },
  'document.file.delete': { key: 'documentFileDelete', fallback: 'Moved a file to the Bin', continuationFallback: 'moved a file to the Bin' },
  'document.file.restore': { key: 'documentFileRestore', fallback: 'Restored a file from the Bin', continuationFallback: 'restored a file from the Bin' },
  'document.zip.link': { key: 'documentZipLink', fallback: 'Downloaded a document ZIP', continuationFallback: 'downloaded a document ZIP' },
  'folder.create': { key: 'folderCreate', fallback: 'Created a folder', continuationFallback: 'created a folder' },
  'folder.update': { key: 'folderUpdate', fallback: 'Updated a folder', continuationFallback: 'updated a folder' },
  'folder.delete': { key: 'folderDelete', fallback: 'Moved a folder to the Bin', continuationFallback: 'moved a folder to the Bin' },
  'folder.restore': { key: 'folderRestore', fallback: 'Restored a folder from the bin', continuationFallback: 'restored a folder from the bin' },
  'folder.zip.link': { key: 'folderZipLink', fallback: 'Downloaded a folder ZIP', continuationFallback: 'downloaded a folder ZIP' },
  'file.download': { key: 'fileDownload', fallback: 'Downloaded a file', continuationFallback: 'downloaded a file' },
  'item.create': { key: 'itemCreate', fallback: 'Saved a password or note', continuationFallback: 'saved a password or note' },
  'item.update': { key: 'itemUpdate', fallback: 'Updated a password or note', continuationFallback: 'updated a password or note' },
  'item.delete': { key: 'itemDelete', fallback: 'Moved a password or note to the Bin', continuationFallback: 'moved a password or note to the Bin' },
  'item.restore': { key: 'itemRestore', fallback: 'Restored a password or note from the Bin', continuationFallback: 'restored a password or note from the Bin' },
  'bin.purge': { key: 'binPurge', fallback: 'Permanently deleted an item from the bin', continuationFallback: 'permanently deleted an item from the bin' },
  'member.create': { key: 'memberCreate', fallback: 'Added a member', continuationFallback: 'added a member' },
  'member.update': { key: 'memberUpdate', fallback: 'Updated a member', continuationFallback: 'updated a member' },
  'member.delete': { key: 'memberDelete', fallback: 'Removed a member', continuationFallback: 'removed a member' },
  'member.reset_password': { key: 'memberResetPassword', fallback: "Reset a member's password", continuationFallback: "reset a member's password" },
  'member.resend_invite': { key: 'memberResendInvite', fallback: 'Resent an invite', continuationFallback: 'resent an invite' },
  'member.access_change': { key: 'memberAccessChange', fallback: "Changed a member's access", continuationFallback: "changed a member's access" },
  'family.update': { key: 'familyUpdate', fallback: 'Updated family settings', continuationFallback: 'updated family settings' },
  'family.test_email': { key: 'familyTestEmail', fallback: 'Sent a test email', continuationFallback: 'sent a test email' },
  'share.create': { key: 'shareCreate', fallback: 'Created a share link', continuationFallback: 'created a share link' },
  'share.revoke': { key: 'shareRevoke', fallback: 'Turned off a share link', continuationFallback: 'turned off a share link' },
  'share.delete': { key: 'shareDelete', fallback: 'Removed a share link', continuationFallback: 'removed a share link' },
  'share.open': { key: 'shareOpen', fallback: 'Opened a share link', continuationFallback: 'opened a share link' },
  'share.download': { key: 'shareDownload', fallback: 'Downloaded from a share link', continuationFallback: 'downloaded from a share link' },
};

/** Short, standalone label — used in the action-type filter dropdown. */
export function labelForAction(action, t) {
  if (!action) return t ? t('activity:actions.fallback', 'Activity') : 'Activity';
  const entry = ACTION_LABELS[action];
  if (entry) return t ? t(`activity:actions.${entry.key}`, entry.fallback) : entry.fallback;
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Sentence tail — appended after the actor's name in the activity feed row. */
export function continuationForAction(action, t) {
  if (!action) return t ? t('activity:continuations.fallback', 'did something') : 'did something';
  const entry = ACTION_LABELS[action];
  if (entry) return t ? t(`activity:continuations.${entry.key}`, entry.continuationFallback) : entry.continuationFallback;
  const formatted = action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return formatted.toLowerCase();
}

/** Broad category from the action's prefix — used to pick an icon/tone. */
export function categoryOf(action) {
  return (action || '').split('.')[0] || 'other';
}
