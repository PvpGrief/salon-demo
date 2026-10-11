/**
 * - Protects /admin (except /admin/login): requires a Supabase session of a
 *   user listed in public.admin_users. RLS enforces the same in the database.
 * - Adds basic security headers to every response.
 */
import { defineMiddleware } from 'astro:middleware';
import { authClient } from './lib/supabase';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/login/']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
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
