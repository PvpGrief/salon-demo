/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by middleware for /admin pages: Supabase client with the admin's session. */
    supabase?: import('@supabase/supabase-js').SupabaseClient;
    user?: import('@supabase/supabase-js').User;
  }
}
