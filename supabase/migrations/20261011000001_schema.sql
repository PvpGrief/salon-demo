-- =============================================================================
-- Salon booking template: core schema
-- Single business per Supabase project (no tenant ids).
-- All timestamps are stored as timestamptz (UTC). Wall-clock rules
-- (working hours, closed days) are interpreted in Europe/Riga.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Settings (exactly one row)
-- -----------------------------------------------------------------------------
create table public.settings (
  id                    smallint primary key default 1 check (id = 1),
  slot_step_min         int  not null default 15  check (slot_step_min between 5 and 120),
  buffer_min            int  not null default 0   check (buffer_min between 0 and 120),
  min_notice_min        int  not null default 120 check (min_notice_min between 0 and 10080),
  max_days_ahead        int  not null default 60  check (max_days_ahead between 1 and 365),
  cancel_hours          int  not null default 24  check (cancel_hours between 0 and 720),
  max_active_per_phone  int  not null default 3   check (max_active_per_phone between 1 and 50),
  retention_months      int  not null default 24  check (retention_months between 1 and 120),
  updated_at            timestamptz not null default now()
);
comment on table public.settings is 'Booking rules. Edited in /admin/iestatijumi.';
insert into public.settings default values;

-- -----------------------------------------------------------------------------
-- Services
-- -----------------------------------------------------------------------------
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 1000),
  category      text not null default '' check (char_length(category) <= 60),
  duration_min  int  not null check (duration_min between 5 and 600),
  price_eur     numeric(8,2) check (price_eur is null or price_eur >= 0), -- null = "pēc vienošanās"
  price_from    boolean not null default false,                           -- true = "no 25 €"
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Masters (staff)
-- -----------------------------------------------------------------------------
create table public.masters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  title       text not null default '' check (char_length(title) <= 80),
  bio         text not null default '' check (char_length(bio) <= 1000),
  photo_url   text check (photo_url is null or char_length(photo_url) <= 500),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.master_services (
  master_id   uuid not null references public.masters(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  primary key (master_id, service_id)
);
create index master_services_service_idx on public.master_services (service_id);

-- Weekly working hours. Several rows per weekday = split shift (e.g. lunch break).
-- weekday: ISO 8601, 1 = pirmdiena ... 7 = svētdiena
create table public.working_hours (
  id          uuid primary key default gen_random_uuid(),
  master_id   uuid not null references public.masters(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time),
  constraint working_hours_no_overlap exclude using gist (
    master_id with =,
    weekday with =,
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&
  )
);

-- -----------------------------------------------------------------------------
-- Closures and blocks
-- -----------------------------------------------------------------------------
-- Whole salon closed (holidays, closed days). Date is a Europe/Riga calendar date.
create table public.closed_days (
  day     date primary key,
  reason  text not null default '' check (char_length(reason) <= 200)
);

-- One master unavailable for a time range (vacation, sick day, one-off lunch).
create table public.master_blocks (
  id          uuid primary key default gen_random_uuid(),
  master_id   uuid not null references public.masters(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null default '' check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index master_blocks_range_idx on public.master_blocks (master_id, starts_at, ends_at);

-- -----------------------------------------------------------------------------
-- Bookings
-- -----------------------------------------------------------------------------
create type public.booking_status as enum ('confirmed', 'cancelled');

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services(id) on delete restrict,
  master_id       uuid not null references public.masters(id) on delete restrict,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- ends_at + settings.buffer_min, set by trigger. The overlap rule uses this.
  blocked_until   timestamptz not null,
  status          public.booking_status not null default 'confirmed',
  customer_name   text not null check (char_length(btrim(customer_name)) between 2 and 100),
  customer_phone  text not null check (customer_phone ~ '^\+?[0-9]{7,15}$'),
  customer_email  text check (
    customer_email is null
    or (char_length(customer_email) <= 254 and customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  comment         text check (comment is null or char_length(comment) <= 1000),
  source          text not null default 'online' check (source in ('online', 'admin')),
  cancel_token    uuid not null default gen_random_uuid() unique,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (blocked_until >= ends_at),
  -- THE double-booking guarantee: two confirmed bookings of the same master
  -- can never overlap, no matter how many requests arrive at the same moment.
  constraint bookings_no_overlap exclude using gist (
    master_id with =,
    tstzrange(starts_at, blocked_until, '[)') with &&
  ) where (status = 'confirmed')
);
create index bookings_starts_idx on public.bookings (starts_at);
create index bookings_phone_idx on public.bookings (customer_phone) where status = 'confirmed';

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at then
    new.blocked_until := new.ends_at
      + make_interval(mins => coalesce((select s.buffer_min from public.settings s where s.id = 1), 0));
  end if;

  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status <> 'cancelled') then
    new.cancelled_at := now();
  elsif new.status = 'confirmed' then
    new.cancelled_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger bookings_before_write
before insert or update on public.bookings
for each row execute function public.bookings_before_write();

-- -----------------------------------------------------------------------------
-- Admin allow-list (there is no public sign-up; see scripts/create-admin.mjs)
-- -----------------------------------------------------------------------------
create table public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  );
$$;
