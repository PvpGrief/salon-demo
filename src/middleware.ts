/**
 * - Shows a clear "not configured" page if Supabase environment variables are
 *   missing (instead of a bare 500 on every page).
 * - Protects /admin (except /admin/login): requires a Supabase session of a
 *   user listed in public.admin_users. RLS enforces the same in the database.
 * - Adds basic security headers to every response.
 */
import { defineMiddleware } from 'astro:middleware';
import { authClient, configProblems } from './lib/supabase';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/login/']);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function notConfigured(problems: string[]): Response {
  const html = `<!doctype html><html lang="lv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Vietne nav konfigurēta</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#2b2326">
<h1 style="font-size:1.5rem">Vietne vēl nav pilnībā konfigurēta</h1>
<p>Lūdzu, mēģiniet vēlāk vai sazinieties ar salonu pa tālruni.</p>
<hr style="margin:2rem 0;border:0;border-top:1px solid #ddd">
<p style="font-size:.9rem;color:#6f6468"><strong>For the site owner:</strong> set these environment variables in the hosting
dashboard (Cloudflare: Worker → Settings → Variables and Secrets, type “Secret”) and redeploy:</p>
<ul style="font-size:.9rem;color:#6f6468">${problems.map((p) => `<li><code>${esc(p)}</code></li>`).join('')}</ul>
</body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '300' },
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const problems = configProblems();
  if (problems.length > 0) {
    console.error(`[config] Site is not configured: ${problems.join('; ')}`);
    return notConfigured(problems);
  }

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdmin) {
    const supabase = authClient(context.request, context.cookies);
    context.locals.supabase = supabase;

    if (!PUBLIC_ADMIN_PATHS.has(pathname)) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        const back = encodeURIComponent(pathname + context.url.search);
        return context.redirect(`/admin/login?next=${back}`);
      }
      const { data: ok } = await supabase.rpc('is_admin');
      if (!ok) {
        await supabase.auth.signOut();
        return context.redirect('/admin/login?error=forbidden');
      }
      context.locals.user = data.user;
    }
  }

  const response = await next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isAdmin) {
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  } else {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  }
  return response;
});
