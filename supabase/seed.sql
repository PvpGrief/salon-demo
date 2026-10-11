-- =============================================================================
-- DEMO DATA: 3 masters, 5 services, working hours, closed days, blocks and
-- bookings around today's date (dates are relative, so the demo always looks
-- alive). Runs automatically on `npx supabase db reset` (local).
--
-- For a REAL client: do NOT run this file. Add services and masters in /admin.
-- To load the demo into a hosted project: `npm run db:seed:remote` (see README).
-- =============================================================================

-- Idempotent: wipe demo-able tables first.
truncate public.bookings, public.master_blocks, public.closed_days,
         public.working_hours, public.master_services, public.masters, public.services
  restart identity cascade;

-- ---------------------------------------------------------------- services
insert into public.services (id, name, description, category, duration_min, price_eur, price_from, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Sieviešu matu griezums', 'Konsultācija, matu mazgāšana, griezums un ieveidošana.', 'Mati', 60, 35, false, 10),
  ('11111111-1111-4111-8111-000000000002', 'Vīriešu matu griezums', 'Klasisks vai moderns griezums ar mazgāšanu un ieveidošanu.', 'Mati', 30, 20, false, 20),
  ('11111111-1111-4111-8111-000000000003', 'Matu krāsošana', 'Vienā tonī, ar saknēm vai balayage. Cena atkarīga no matu garuma.', 'Mati', 120, 60, true, 30),
  ('11111111-1111-4111-8111-000000000004', 'Manikīrs ar gēllaku', 'Nagu formas korekcija, kutikulas apstrāde un gēllakas pārklājums.', 'Nagi', 90, 30, false, 40),
  ('11111111-1111-4111-8111-000000000005', 'Uzacu korekcija un krāsošana', 'Formas korekcija ar vasku vai pinceti un krāsošana.', 'Seja', 30, 18, false, 50);

-- ---------------------------------------------------------------- masters
insert into public.masters (id, name, title, bio, photo_url, sort_order) values
  ('22222222-2222-4222-8222-000000000001', 'Anna Bērziņa', 'Stiliste-koloriste',
   'Vairāk nekā 10 gadu pieredze matu krāsošanā un griezumos. Iesaka toni, kas izceļ tieši jūsu dabisko skaistumu.',
   '/images/masters/master-1.svg', 10),
  ('22222222-2222-4222-8222-000000000002', 'Laura Kalniņa', 'Nagu un uzacu meistare',
   'Rūpīga, precīza un vienmēr sekojoša jaunākajām tendencēm. Strādā tikai ar sterilizētiem instrumentiem.',
   '/images/masters/master-2.svg', 20),
  ('22222222-2222-4222-8222-000000000003', 'Mārtiņš Ozols', 'Frizieris',
   'Klasiski un moderni griezumi vīriešiem un sievietēm. Ātri, kvalitatīvi un ar labu garastāvokli.',
   '/images/masters/master-3.svg', 30);

insert into public.master_services (master_id, service_id) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000003'),
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000005'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000004'),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000005'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001'),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000002');

-- ---------------------------------------------------------------- working hours
-- Anna: Mon–Fri 09:00–13:00 and 13:30–18:00 (lunch break), Sat 10:00–15:00
insert into public.working_hours (master_id, weekday, start_time, end_time)
select '22222222-2222-4222-8222-000000000001'::uuid, d, t.s::time, t.e::time
from generate_series(1, 5) d,
     (values ('09:00', '13:00'), ('13:30', '18:00')) t(s, e)
union all
select '22222222-2222-4222-8222-000000000001'::uuid, 6, '10:00'::time, '15:00'::time;

-- Laura: Tue–Sat 10:00–19:00
insert into public.working_hours (master_id, weekday, start_time, end_time)
select '22222222-2222-4222-8222-000000000002', d, '10:00', '19:00' from generate_series(2, 6) d;

-- Mārtiņš: Mon–Fri 11:00–20:00
insert into public.working_hours (master_id, weekday, start_time, end_time)
select '22222222-2222-4222-8222-000000000003', d, '11:00', '20:00' from generate_series(1, 5) d;

-- ---------------------------------------------------------------- closed days
-- Upcoming Latvian public holidays (next occurrence of each date).
insert into public.closed_days (day, reason)
select case when make_date(y, m, d) >= (now() at time zone 'Europe/Riga')::date then make_date(y, m, d)
            else make_date(y + 1, m, d) end,
       reason
from (select extract(year from (now() at time zone 'Europe/Riga')::date)::int as y) yr,
     (values (11, 18, 'Latvijas Republikas proklamēšanas diena'),
             (12, 24, 'Ziemassvētku vakars'),
             (12, 25, 'Pirmie Ziemassvētki'),
             (12, 26, 'Otrie Ziemassvētki'),
             (12, 31, 'Vecgada vakars'),
             (1, 1, 'Jaungada diena'),
             (5, 1, 'Darba svētki'),
             (6, 23, 'Līgo diena'),
             (6, 24, 'Jāņi')) h(m, d, reason)
on conflict (day) do nothing;

-- ---------------------------------------------------------------- master blocks
-- Laura on vacation for 2 days starting in 10 days; Mārtiņš has a doctor visit tomorrow.
insert into public.master_blocks (master_id, starts_at, ends_at, reason)
values
  ('22222222-2222-4222-8222-000000000002',
   (((now() at time zone 'Europe/Riga')::date + 10)::timestamp) at time zone 'Europe/Riga',
   (((now() at time zone 'Europe/Riga')::date + 12)::timestamp) at time zone 'Europe/Riga',
   'Atvaļinājums'),
  ('22222222-2222-4222-8222-000000000003',
   (((now() at time zone 'Europe/Riga')::date + 1)::timestamp + time '14:00') at time zone 'Europe/Riga',
   (((now() at time zone 'Europe/Riga')::date + 1)::timestamp + time '15:30') at time zone 'Europe/Riga',
   'Ārsta vizīte');

-- ---------------------------------------------------------------- bookings
-- A few bookings per working day from yesterday until 7 days ahead.
-- Only inserted where the master actually works and the time is free.
do $$
declare
  v_names  text[] := array['Ilze K.', 'Kristīne L.', 'Jānis P.', 'Dace S.', 'Elīna V.',
                           'Andris B.', 'Sanita R.', 'Liene O.', 'Edgars M.', 'Zane T.',
                           'Inese G.', 'Rūta A.', 'Agnese D.', 'Toms Z.', 'Baiba Č.'];
  v_plan   record;
  v_day    int;
  v_start  timestamptz;
  v_end    timestamptz;
  v_dur    int;
  v_i      int := 0;
begin
  for v_day in -1..7 loop
    for v_plan in
      select * from (values
        ('22222222-2222-4222-8222-000000000001'::uuid, '11111111-1111-4111-8111-000000000003'::uuid, time '09:00'),
        ('22222222-2222-4222-8222-000000000001',       '11111111-1111-4111-8111-000000000001',       time '14:00'),
        ('22222222-2222-4222-8222-000000000001',       '11111111-1111-4111-8111-000000000005',       time '16:30'),
        ('22222222-2222-4222-8222-000000000002',       '11111111-1111-4111-8111-000000000004',       time '10:00'),
        ('22222222-2222-4222-8222-000000000002',       '11111111-1111-4111-8111-000000000004',       time '13:00'),
        ('22222222-2222-4222-8222-000000000002',       '11111111-1111-4111-8111-000000000005',       time '17:00'),
        ('22222222-2222-4222-8222-000000000003',       '11111111-1111-4111-8111-000000000002',       time '11:00'),
        ('22222222-2222-4222-8222-000000000003',       '11111111-1111-4111-8111-000000000001',       time '16:00'),
        ('22222222-2222-4222-8222-000000000003',       '11111111-1111-4111-8111-000000000002',       time '18:30')
      ) p(master_id, service_id, at_time)
      -- skip some combinations so days look different
      where (extract(minute from p.at_time)::int + v_day + extract(hour from p.at_time)::int) % 3 <> 0
    loop
      select duration_min into v_dur from public.services where id = v_plan.service_id;
      v_start := (((now() at time zone 'Europe/Riga')::date + v_day)::timestamp + v_plan.at_time) at time zone 'Europe/Riga';
      v_end   := v_start + make_interval(mins => v_dur);

      continue when not public.fits_schedule(v_plan.master_id, v_start, v_end, 15);
      continue when exists (select 1 from public.bookings b
                            where b.master_id = v_plan.master_id and b.status = 'confirmed'
                              and b.starts_at < v_end and b.blocked_until > v_start);
      v_i := v_i + 1;
      insert into public.bookings (service_id, master_id, starts_at, ends_at, blocked_until,
                                   customer_name, customer_phone, customer_email, comment, source)
      values (v_plan.service_id, v_plan.master_id, v_start, v_end, v_end,
              v_names[1 + (v_i % array_length(v_names, 1))],
              '+3712' || lpad((1000000 + v_i)::text, 7, '0'),
              case when v_i % 2 = 0 then 'klients' || v_i || '@example.com' end,
              case when v_i % 4 = 0 then 'Pirmo reizi pie jums.' end,
              case when v_i % 3 = 0 then 'admin' else 'online' end);
    end loop;
  end loop;

  -- One cancelled booking for the demo.
  update public.bookings set status = 'cancelled'
  where id = (select id from public.bookings where starts_at > now() order by starts_at offset 2 limit 1);
end $$;
