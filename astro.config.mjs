// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { business } from './src/config/business.ts';

/**
 * Hosting target. Default: Cloudflare Workers.
 *   DEPLOY_TARGET=netlify  → Netlify
 *   DEPLOY_TARGET=node     → any Node.js server (also handy for local preview)
 */
const target = process.env.DEPLOY_TARGET ?? 'cloudflare';

async function adapter() {
  if (target === 'netlify') return (await import('@astrojs/netlify')).default();
  if (target === 'node') return (await import('@astrojs/node')).default({ mode: 'standalone' });
  // Images are plain files in /public, no Cloudflare Images binding needed.
  return (await import('@astrojs/cloudflare')).default({ imageService: 'passthrough' });
}

export default defineConfig({
  site: process.env.SITE_URL || business.siteUrl,
  output: 'server',
  adapter: await adapter(),
  // Admin login uses Supabase cookies; Astro sessions (KV storage) are not needed.
  session: false,
  // Keep normal HTML whitespace rules in templates (Astro 7 defaults to JSX-style).
  compressHTML: true,
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  security: { checkOrigin: true },
  env: {
    schema: {
      // Required at runtime, but declared optional so a missing value shows a
      // clear "not configured" page (src/middleware.ts) instead of a bare 500.
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_ANON_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // E-mail (optional): resend | brevo. Unset = whichever key is present.
      EMAIL_PROVIDER: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      BREVO_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
    validateSecrets: false,
  },
});
