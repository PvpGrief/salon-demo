-- =============================================================================
-- Booking logic in the database.
--
-- The website computes the list of free slots in TypeScript
-- (src/lib/booking/slots.ts). These functions are the final authority: every
-- online booking goes through public.create_booking(), which re-checks all
-- rules and relies on the bookings_no_overlap constraint against races.
-- Keep both implementations in sync (tests/db/consistency.db.test.ts).
--
-- Errors are raised with a short machine-readable message the app maps to
-- Latvian text: service_not_found, master_not_found, invalid_input,
-- too_soon, too_far, too_many_bookings, slot_unavailable,
-- booking_not_found, cancel_too_late.
-- =============================================================================

-- Normalize a phone number: keep digits and a leading '+'.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null then null
    when btrim(p_phone) like '+%' then '+' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    else regexp_replace(p_phone, '[^0-9]', '', 'g')
  end;
$$;

-- Does [p_starts_at, p_ends_at) fit the master's schedule?
-- (salon open, inside one working-hours interval, aligned to the slot grid,
-- not inside a master block). Existing bookings are NOT checked here.
create or replace function public.fits_schedule(
  p_master_id uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_step_min  int
)
returns boolean
language sql
stable
set search_path = ''
as $$
  with l as (
    select (p_starts_at at time zone 'Europe/Riga') as ls,
           (p_ends_at   at time zone 'Europe/Riga') as le
  )
  select
        l.ls::date = l.le::date
    and extract(second from l.ls) = 0
    and not exists (select 1 from public.closed_days c where c.day = l.ls::date)
    and exists (
      select 1
      from public.working_hours w
      where w.master_id = p_master_id
        and w.weekday = extract(isodow from l.ls)::int
        and l.ls::time >= w.start_time
        and l.le::time <= w.end_time
        and ((extract(epoch from (l.ls::time - w.start_time))::int / 60) % p_step_min) = 0
    )
    and not exists (
      select 1
      from public.master_blocks b
      where b.master_id = p_master_id
        and b.starts_at < p_ends_at
        and b.ends_at   > p_starts_at
    )
  from l;
$$;

-- -----------------------------------------------------------------------------
-- create_booking: the only way the public creates bookings.
-- Called by the website server with the service-role key (not exposed to anon).
-- p_master_id = null means "jebkurš brīvais meistars" (any available master).
-- -----------------------------------------------------------------------------
create or replace function public.create_booking(
  p_service_id  uuid,
  p_master_id   uuid,
  p_starts_at   timestamptz,
  p_name        text,
  p_phone       text,
  p_email       text default null,
  p_comment     text default null
)
returns table (
  id            uuid,
  master_id     uuid,
  starts_at     timestamptz,
  ends_at       timestamptz,
  cancel_token  uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_settings      public.settings%rowtype;
  v_service       public.services%rowtype;
  v_ends_at       timestamptz;
  v_blocked_until timestamptz;
  v_phone         text := public.normalize_phone(p_phone);
  v_email         text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_comment       text := nullif(btrim(coalesce(p_comment, '')), '');
  v_name          text := btrim(coalesce(p_name, ''));
  v_local_day     date := (p_starts_at at time zone 'Europe/Riga')::date;
  v_today         date := (now() at time zone 'Europe/Riga')::date;
  v_candidate     uuid;
  v_row           public.bookings%rowtype;
begin
  select * into v_settings from public.settings s where s.id = 1;

  select * into v_service from public.services s where s.id = p_service_id and s.active;
  if not found then
    raise exception 'service_not_found';
  end if;

  if p_starts_at is null
     or char_length(v_name) not between 2 and 100
     or v_phone is null or v_phone !~ '^\+?[0-9]{7,15}$'
     or (v_email is not null and (char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
     or char_length(coalesce(v_comment, '')) > 1000 then
    raise exception 'invalid_input';
  end if;

  if p_starts_at < now() + make_interval(mins => v_settings.min_notice_min) then
    raise exception 'too_soon';
  end if;
  if v_local_day > v_today + v_settings.max_days_ahead then
    raise exception 'too_far';
  end if;

  if (select count(*) from public.bookings b
       where b.customer_phone = v_phone
         and b.status = 'confirmed'
         and b.starts_at > now()) >= v_settings.max_active_per_phone then
    raise exception 'too_many_bookings';
  end if;

  if p_master_id is not null
     and not exists (
       select 1 from public.masters m
       join public.master_services ms on ms.master_id = m.id and ms.service_id = p_service_id
       where m.id = p_master_id and m.active
     ) then
    raise exception 'master_not_found';
  end if;

  v_ends_at       := p_starts_at + make_interval(mins => v_service.duration_min);
  v_blocked_until := v_ends_at + make_interval(mins => v_settings.buffer_min);

  -- Candidate masters. For "any", prefer the master with the fewest bookings
  -- that day, then the display order.
  for v_candidate in
    select m.id
    from public.masters m
    join public.master_services ms on ms.master_id = m.id and ms.service_id = p_service_id
    where m.active
      and (p_master_id is null or m.id = p_master_id)
    order by (
      select count(*) from public.bookings b
      where b.master_id = m.id
        and b.status = 'confirmed'
        and (b.starts_at at time zone 'Europe/Riga')::date = v_local_day
    ), m.sort_order, m.name
  loop
    continue when not public.fits_schedule(v_candidate, p_starts_at, v_ends_at, v_settings.slot_step_min);
    continue when exists (
      select 1 from public.bookings b
      where b.master_id = v_candidate
        and b.status = 'confirmed'
        and b.starts_at < v_blocked_until
        and b.blocked_until > p_starts_at
    );

    begin
      insert into public.bookings (
        service_id, master_id, starts_at, ends_at, blocked_until,
        customer_name, customer_phone, customer_email, comment, source
      ) values (
        p_service_id, v_candidate, p_starts_at, v_ends_at, v_blocked_until,
        v_name, v_phone, v_email, v_comment, 'online'
      )
      returning * into v_row;
    exception when exclusion_violation then
      -- Someone else took this master at the same moment; try the next one.
      continue;
    end;

    return query select v_row.id, v_row.master_id, v_row.starts_at, v_row.ends_at, v_row.cancel_token;
    return;
  end loop;

  raise exception 'slot_unavailable';
end;
$$;

-- -----------------------------------------------------------------------------
-- Public schedule: busy intervals only, no customer data, no block reasons.
-- Used for slot calculation and for the public /pieejamiba view.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_schedule(p_from timestamptz, p_to timestamptz)
returns table (
  master_id  uuid,
  starts_at  timestamptz,
  ends_at    timestamptz,
  kind       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '93 days' then
    raise exception 'invalid_input';
  end if;

  return query
    select b.master_id, b.starts_at, b.blocked_until, 'booked'::text
    from public.bookings b
    join public.masters m on m.id = b.master_id and m.active
    where b.status = 'confirmed'
      and b.starts_at < p_to
      and b.blocked_until > p_from
    union all
    select k.master_id, k.starts_at, k.ends_at, 'blocked'::text
    from public.master_blocks k
    join public.masters m on m.id = k.master_id and m.active
    where k.starts_at < p_to
      and k.ends_at > p_from
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Customer self-service via the secret link in the confirmation e-mail.
-- -----------------------------------------------------------------------------
create or replace function public.get_booking_by_token(p_token uuid)
returns table (
  id            uuid,
  service_name  text,
  master_name   text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        public.booking_status,
  can_cancel    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, s.name, m.name, b.starts_at, b.ends_at, b.status,
         b.status = 'confirmed'
           and b.starts_at - make_interval(hours => st.cancel_hours) > now()
  from public.bookings b
  join public.services s on s.id = b.service_id
  join public.masters  m on m.id = b.master_id
  cross join public.settings st
  where b.cancel_token = p_token;
$$;

create or replace function public.cancel_booking_by_token(p_token uuid)
returns table (
  id              uuid,
  service_name    text,
  master_name     text,
  starts_at       timestamptz,
  customer_name   text,
  customer_email  text,
  customer_phone  text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_cancel_hours int;
begin
  select * into v_booking from public.bookings b where b.cancel_token = p_token for update;
  if not found or v_booking.status <> 'confirmed' then
    raise exception 'booking_not_found';
  end if;

  select s.cancel_hours into v_cancel_hours from public.settings s where s.id = 1;
  if v_booking.starts_at - make_interval(hours => v_cancel_hours) <= now() then
    raise exception 'cancel_too_late';
  end if;

  update public.bookings b set status = 'cancelled' where b.id = v_booking.id;

  return query
    select v_booking.id, s.name, m.name, v_booking.starts_at,
           v_booking.customer_name, v_booking.customer_email, v_booking.customer_phone
    from public.services s, public.masters m
    where s.id = v_booking.service_id and m.id = v_booking.master_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- GDPR: anonymize customer data of bookings older than settings.retention_months.
-- Run from /admin/iestatijumi (or schedule with pg_cron).
-- -----------------------------------------------------------------------------
create or replace function public.anonymize_old_bookings()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    raise exception 'forbidden';
  end if;

  update public.bookings b
     set customer_name  = 'Dzēsts klients',
         customer_phone = '0000000',
         customer_email = null,
         comment        = null
   where b.starts_at < now() - make_interval(months => (select s.retention_months from public.settings s where s.id = 1))
     and b.customer_phone <> '0000000';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
