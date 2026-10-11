/**
 * GET /admin/api/slots?service&master&date&duration&exclude
 * Free start times for the admin booking form (protected by middleware).
 * Ignores the notice period and horizon; `exclude` = booking being edited.
 */
import type { APIRoute } from 'astro';
import { loadCatalogue, toSlotSettings } from '../../../lib/booking/availability';
import { computeDaySlots, type BusyInterval } from '../../../lib/booking/slots';
import { addDays, isDateString, rigaToUtc } from '../../../lib/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ url, locals }) => {
  const supabase = locals.supabase;
  if (!supabase || !locals.user) return new Response('Unauthorized', { status: 401 });

  const service = url.searchParams.get('service') ?? '';
  const master = url.searchParams.get('master') ?? '';
  const date = url.searchParams.get('date') ?? '';
  const exclude = url.searchParams.get('exclude') ?? '';
  if (!UUID.test(service) || !UUID.test(master) || !isDateString(date)) return new Response('Bad request', { status: 400 });

  const cat = await loadCatalogue(supabase);
  const { data: svc } = await supabase.from('services').select('duration_min').eq('id', service).single();
  const duration = Number(url.searchParams.get('duration')) || svc?.duration_min || 60;

  const from = rigaToUtc(date, '00:00').toISOString();
  const to = rigaToUtc(addDays(date, 1), '00:00').toISOString();
  let bq = supabase.from('bookings').select('id, starts_at, blocked_until').eq('master_id', master).eq('status', 'confirmed').lt('starts_at', to).gt('blocked_until', from);
  if (UUID.test(exclude)) bq = bq.neq('id', exclude);
  const [bookings, blocks] = await Promise.all([
    bq,
    supabase.from('master_blocks').select('starts_at, ends_at').eq('master_id', master).lt('starts_at', to).gt('ends_at', from),
  ]);

  const busy: BusyInterval[] = [
    ...(bookings.data ?? []).map((b) => ({ masterId: master, start: new Date(b.starts_at), end: new Date(b.blocked_until), kind: 'booked' as const })),
    ...(blocks.data ?? []).map((b) => ({ masterId: master, start: new Date(b.starts_at), end: new Date(b.ends_at), kind: 'blocked' as const })),
  ];
  const slots = computeDaySlots({
    date,
    durationMin: duration,
    masterIds: [master],
    workingHours: cat.workingHours,
    closedDays: new Set(cat.closedDays.keys()),
    busy,
    settings: toSlotSettings(cat.settings),
    now: new Date(),
    ignoreNoticeAndHorizon: true,
  });
  return new Response(JSON.stringify({ times: slots.map((s) => s.time) }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
