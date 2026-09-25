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
