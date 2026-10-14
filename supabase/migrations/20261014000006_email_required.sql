-- =============================================================================
-- Online bookings: e-mail is required, the phone number is optional.
-- (Admin-created phone bookings may still store a phone and no e-mail.)
--
-- Slot/availability rules are unchanged; only contact validation and the
-- "too many active bookings" limit (now per e-mail) change.
-- =============================================================================

alter table public.bookings alter column customer_phone drop not null;

-- Every booking needs at least one way to contact the customer.
alter table public.bookings
  add constraint bookings_contact_required
  check (customer_email is not null or customer_phone is not null);

drop index if exists public.bookings_phone_idx;
create index bookings_email_idx on public.bookings (lower(customer_email)) where status = 'confirmed';

comment on column public.settings.max_active_per_phone is
  'Max active future online bookings per customer e-mail (name kept for compatibility).';

-- -----------------------------------------------------------------------------
-- create_booking: same signature and slot logic as before; e-mail required,
-- phone optional, limit counted per e-mail.
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
  v_phone         text := nullif(public.normalize_phone(p_phone), '');
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
     or v_email is null or char_length(v_email) > 254 or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     -- phone is optional, but if one is given it must be valid
     or (btrim(coalesce(p_phone, '')) <> '' and (v_phone is null or v_phone !~ '^\+?[0-9]{7,15}$'))
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
       where lower(b.customer_email) = v_email
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
-- GDPR clean-up: also handle bookings without a phone number.
-- Anonymized rows are marked with phone '0000000' and no e-mail.
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
     and (b.customer_phone is distinct from '0000000' or b.customer_email is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
