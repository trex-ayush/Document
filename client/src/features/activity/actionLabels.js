/**
 * Human-readable labels for `Activity.action` codes (docs/API.md "Activity &
 * Stats" — `{ id, actorName, action, targetType, targetId, ... }`). Built
 * from every `logActivity(..., { action: '...' })` call site across the
 * server (grepped, not hand-guessed) so the Activity page never shows a raw
 * `document.file.add`-style code to a user. Unknown/future codes still
 * render sensibly via `labelForAction`'s fallback.
 */
export const ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout': 'Signed out',
  'auth.logout_all': 'Signed out of all devices',
  'auth.signup': 'Created the family vault',
  'auth.change_password': 'Changed password',
  'auth.reset_password': 'Reset password',
  'auth.forgot_password': 'Requested a password reset',
  'auth.reauth': 'Re-confirmed identity',
  'auth.set_password': 'Set a password',
  'auth.google_link': 'Linked Google account',
  'auth.google_unlink': 'Unlinked Google account',
  'document.create': 'Uploaded a document',
  'document.update': 'Updated a document',
  'document.delete': 'Deleted a document',
  'document.view': 'Viewed a document',
  'document.file.add': 'Added a file',
  'document.file.replace': 'Replaced a file',
  'document.file.update': 'Updated a file',
  'document.file.delete': 'Deleted a file',
  'document.zip.link': 'Downloaded a document ZIP',
  'document_type.create': 'Created a document type',
  'document_type.update': 'Updated a document type',
  'document_type.delete': 'Deleted a document type',
  'folder.create': 'Created a folder',
  'folder.update': 'Updated a folder',
  'folder.delete': 'Deleted a folder',
  'folder.zip.link': 'Downloaded a folder ZIP',
  'field.reveal': 'Revealed a saved value',
  'field.update': 'Updated a custom field',
  'file.download': 'Downloaded a file',
  'item.create': 'Created a vault item',
  'item.update': 'Updated a vault item',
  'item.delete': 'Deleted a vault item',
  'member.create': 'Added a member',
  'member.update': 'Updated a member',
  'member.delete': 'Removed a member',
  'member.reset_password': "Reset a member's password",
  'member.resend_invite': 'Resent an invite',
  'member.access_change': "Changed a member's access",
  'family.update': 'Updated family settings',
  'family.test_email': 'Sent a test email',
  'share.create': 'Created a share link',
  'share.revoke': 'Revoked a share link',
  'share.update': 'Updated a share link',
  'share.delete': 'Deleted a share link',
  'share.open': 'Opened a share link',
  'share.download': 'Downloaded from a share link',
  'share.password_failed': 'Entered a wrong share password',
};

export function labelForAction(action) {
  if (!action) return 'Activity';
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Broad category from the action's prefix — used to pick an icon/tone. */
export function categoryOf(action) {
  return (action || '').split('.')[0] || 'other';
}
