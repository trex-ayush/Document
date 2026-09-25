import './helpers/setupEnv.js';
import { describe, it, expect } from 'vitest';
import { passwordResetEmail, testEmail } from '../src/services/emailTemplates.js';

// The logo header is shared by every template via baseLayout() — password reset is enough to
// exercise it without duplicating this per template.
describe('email templates — logo header', () => {
  it('renders both light and dark logo images as absolute CLIENT_URL-based URLs', () => {
    const { html } = passwordResetEmail({ name: 'Jamie', resetUrl: 'http://localhost:5173/reset-password?token=abc' });

    expect(html).toContain('http://localhost:5173/assets/email-logo-light-bg.png');
    expect(html).toContain('http://localhost:5173/assets/email-logo-dark-bg.png');
  });

  it('gives each logo image explicit dimensions and alt text for Gmail/blocked-image robustness', () => {
    const { html } = testEmail({ name: 'Jamie' });

    const imgTags = html.match(/<img[^>]*>/g) || [];
    const logoTags = imgTags.filter((tag) => tag.includes('email-logo-'));
    expect(logoTags).toHaveLength(2);
    for (const tag of logoTags) {
      expect(tag).toMatch(/alt="Family Vault"/);
      expect(tag).toMatch(/width="\d+"/);
      expect(tag).toMatch(/height="\d+"/);
    }
  });

  it('hides the dark-bg logo by default and swaps it in under prefers-color-scheme: dark', () => {
    const { html } = testEmail({ name: 'Jamie' });

    expect(html).toMatch(/\.fv-logo-dark\s*\{\s*display:\s*none;\s*\}/);
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toMatch(/class="fv-logo-light"[^>]*style="display:block;/);
    expect(html).toMatch(/class="fv-logo-dark"[^>]*style="display:none;/);
  });
});
