-- =============================================================================
-- Row Level Security and privileges.
--
--   anon (public visitors)  : read services, masters, hours, closed days,
--                             settings; call get_public_schedule(). Nothing else.
--                             Cannot read or write bookings or master blocks.
--   authenticated           : same as anon, plus full access ONLY if the user
--                             is in public.admin_users (is_admin()).
--   service_role (server)   : bypasses RLS; used by the website server for
--                             create_booking() and the cancel link.
-- =============================================================================

-- Start from zero: no implicit privileges for API roles.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.settings        enable row level security;
alter table public.services        enable row level security;
alter table public.masters         enable row level security;
alter table public.master_services enable row level security;
alter table public.working_hours   enable row level security;
alter table public.closed_days     enable row level security;
alter table public.master_blocks   enable row level security;
alter table public.bookings        enable row level security;
alter table public.admin_users     enable row level security;

-- ---------------------------------------------------------------- table grants
grant select on public.settings, public.services, public.masters,
                public.master_services, public.working_hours, public.closed_days
  to anon, authenticated;

grant insert, update, delete on public.services, public.masters, public.master_services,
                                public.working_hours, public.closed_days
  to authenticated;
grant update on public.settings to authenticated;
grant select, insert, update, delete on public.master_blocks, public.bookings to authenticated;
grant select on public.admin_users to authenticated;

grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------- policies
-- Public catalogue: anyone may read active rows; admin sees everything.
create policy "public read settings" on public.settings
  for select to anon, authenticated using (true);
create policy "admin update settings" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read active services" on public.services
  for select to anon, authenticated using (active or public.is_admin());
create policy "admin write services" on public.services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read active masters" on public.masters
  for select to anon, authenticated using (active or public.is_admin());
create policy "admin write masters" on public.masters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read master_services" on public.master_services
  for select to anon, authenticated using (true);
create policy "admin write master_services" on public.master_services
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read working_hours" on public.working_hours
  for select to anon, authenticated using (true);
create policy "admin write working_hours" on public.working_hours
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read closed_days" on public.closed_days
  for select to anon, authenticated using (true);
create policy "admin write closed_days" on public.closed_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Private: admin only.
create policy "admin all master_blocks" on public.master_blocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin all bookings" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own admin row" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- functions
grant execute on function public.is_admin()                                   to anon, authenticated, service_role;
grant execute on function public.get_public_schedule(timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.normalize_phone(text)                        to anon, authenticated, service_role;
grant execute on function public.fits_schedule(uuid, timestamptz, timestamptz, int) to authenticated, service_role;
grant execute on function public.anonymize_old_bookings()                     to authenticated, service_role;

-- Server-only (service role key never leaves the server):
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, text, text) to service_role;
grant execute on function public.get_booking_by_token(uuid)    to service_role;
grant execute on function public.cancel_booking_by_token(uuid) to service_role;

-- Functions created later by the postgres role must not become public by default.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
