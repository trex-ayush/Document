import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// index.html uses Vite's built-in %VITE_SITE_URL% substitution for the absolute og:image URL.
// When the env var isn't set (local dev, or a deploy that hasn't configured it yet), Vite leaves
// the literal placeholder in place — this plugin fills in the live site (on Render) instead.
const SITE_URL_FALLBACK = 'https://family-vault-3edo.onrender.com';
// Give Vite the fallback up front too: without it, Vite warns "%VITE_SITE_URL% is not defined"
// on every page load in local dev before the plugin below gets to replace it.
if (!process.env.VITE_SITE_URL) process.env.VITE_SITE_URL = SITE_URL_FALLBACK;
function siteUrlFallbackPlugin() {
  return {
    name: 'site-url-fallback',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/%VITE_SITE_URL%/g, process.env.VITE_SITE_URL || SITE_URL_FALLBACK);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), siteUrlFallbackPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
