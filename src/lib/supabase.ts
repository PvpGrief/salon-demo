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

/**
 * Problems with the Supabase environment variables (names only, never values).
 * Empty list = configured. Checked on every request by src/middleware.ts.
 */
export function configProblems(): string[] {
  const problems: string[] = [];
  const required = { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
  for (const [name, value] of Object.entries(required)) {
    if (!value?.trim()) problems.push(`${name} is missing`);
  }
  if (SUPABASE_URL?.trim() && !/^https?:\/\/[^/\s]+\/?$/.test(SUPABASE_URL.trim())) {
    problems.push('SUPABASE_URL must look like https://xxxx.supabase.co (Project Settings → Data API → Project URL)');
  }
  return problems;
}

function env(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is missing – set it in the hosting environment (see README).`);
  return value.trim();
}

const url = () => env(SUPABASE_URL, 'SUPABASE_URL').replace(/\/$/, '');

export function publicClient(): SupabaseClient {
  return createClient(url(), env(SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY'), noSession);
}

export function serviceClient(): SupabaseClient {
  return createClient(url(), env(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'), noSession);
}

export function authClient(request: Request, cookies: AstroCookies): SupabaseClient {
  const secure = new URL(request.url).protocol === 'https:';
  return createServerClient(url(), env(SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY'), {
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
