/**
 * Supabase clients (server-side only – keys never reach the browser).
 *
 *   publicClient()  anon key, RLS applies – public catalogue + schedule
 *   serviceClient() service-role key, bypasses RLS – ONLY for create_booking
 *                   and the customer cancel link
 *   authClient()    anon key + the admin's session cookies – used in /admin;
 *                   RLS lets it through only if the user is in admin_users
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from 'astro:env/server';

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function publicClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, noSession);
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, noSession);
}

export function authClient(request: Request, cookies: AstroCookies): SupabaseClient {
  const secure = new URL(request.url).protocol === 'https:';
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? '',
        }));
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          cookies.set(name, value, { ...options, path: '/', sameSite: 'lax', httpOnly: true, secure });
        }
      },
    },
  });
}
