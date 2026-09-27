import './helpers/setupEnv.js';
import { describe, it, expect } from 'vitest';
import { passwordResetEmail, testEmail } from '../src/services/emailTemplates.js';

// The logo header is shared by every template via baseLayout() — password reset is enough to
// exercise it without duplicating this per template.
describe('email templates — logo header', () => {
  it('renders one logo image as an absolute CLIENT_URL-based URL', () => {
    const { html } = passwordResetEmail({ name: 'Jamie', resetUrl: 'http://localhost:5173/reset-password?token=abc' });

    expect(html).toContain('http://localhost:5173/assets/email-logo.png');
  });

  it('gives the logo explicit dimensions and alt text for Gmail/blocked-image robustness', () => {
    const { html } = testEmail({ name: 'Jamie' });

    const imgTags = html.match(/<img[^>]*>/g) || [];
    const logoTags = imgTags.filter((tag) => tag.includes('email-logo'));
    expect(logoTags).toHaveLength(1);
    expect(logoTags[0]).toMatch(/alt="Family Vault"/);
    expect(logoTags[0]).toMatch(/width="\d+"/);
    expect(logoTags[0]).toMatch(/height="\d+"/);
  });

  it('does not rely on a prefers-color-scheme swap (Gmail dark mode ignores it)', () => {
    const { html } = testEmail({ name: 'Jamie' });

    expect(html).not.toContain('prefers-color-scheme');
    expect(html).not.toContain('email-logo-dark-bg');
  });
});

describe('email templates — content', () => {
  it('names the account in the failed sign-in alert, in plain words', async () => {
    const { failedLoginsEmail } = await import('../src/services/emailTemplates.js');
    const en = failedLoginsEmail({ familyName: 'Singh Family', memberName: 'Asha', memberEmail: 'asha@example.com', time: '2026-09-26T13:42:00Z' });
    expect(en.subject).toContain('Asha');
    expect(en.text).toContain('Asha (asha@example.com)');
    expect(en.text).toContain('Forgot password?');

    const hi = failedLoginsEmail({ familyName: 'Singh Family', memberName: 'Asha', memberEmail: 'asha@example.com', lang: 'hi' });
    expect(hi.subject).toContain('गलत पासवर्ड');
    expect(hi.html).toContain('lang="hi"');
  });

  it('says who did it and uses access words, not raw codes', async () => {
    const { memberAccessChangedEmail, memberRemovedEmail, memberAddedEmail } = await import('../src/services/emailTemplates.js');
    const changed = memberAccessChangedEmail({ familyName: 'F', memberName: 'Asha', access: 'read', byName: 'Ravi' });
    expect(changed.text).toContain('Ravi changed');
    expect(changed.text).toContain('can only view');
    expect(changed.text).not.toContain('"read"');

    const admin = memberAccessChangedEmail({ familyName: 'F', memberName: 'Asha', access: 'write', role: 'admin', byName: 'Ravi' });
    expect(admin.text).toContain('family admin');

    expect(memberRemovedEmail({ familyName: 'F', memberName: 'Asha', byName: 'Ravi' }).text).toContain('Everything they added stays');
    const added = memberAddedEmail({ familyName: 'F', memberName: 'Asha', memberEmail: 'a@x.com', access: 'write', byName: 'Ravi' });
    expect(added.text).toContain('Ravi added Asha (a@x.com) to F.');
    expect(added.text).toContain('can view and add');
  });

  it('points the delete alert at the Bin and the invite at its expiry', async () => {
    const { itemsDeletedEmail, memberInviteEmail } = await import('../src/services/emailTemplates.js');
    const del = itemsDeletedEmail({ familyName: 'F', byName: 'Ravi', items: [{ kind: 'document', label: 'PAN' }] });
    expect(del.text).toContain('1 document was deleted by Ravi');
    expect(del.text).toContain('/bin');

    const inv = memberInviteEmail({ familyName: 'F', inviterName: 'Ravi', acceptUrl: 'http://x/accept', toEmail: 'a@x.com', access: 'read', expiresAt: '2026-10-03T10:00:00Z' });
    expect(inv.text).toContain('(a@x.com)');
    expect(inv.text).toContain('can only view');
    expect(inv.text).toContain('3 Oct 2026');
  });

  it('escapes names in the HTML', async () => {
    const { memberRemovedEmail } = await import('../src/services/emailTemplates.js');
    const { html } = memberRemovedEmail({ familyName: 'F', memberName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
