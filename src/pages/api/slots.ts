/**
 * GET /api/slots?service=<uuid>&master=<uuid|any>&from=YYYY-MM-DD&days=14
 * Free booking slots per day. Public; contains no personal data.
 */
import type { APIRoute } from 'astro';
import { loadBusy, loadCatalogue, mastersForService } from '../../lib/booking/availability';
import { computeRangeSlots } from '../../lib/booking/slots';
import { toSlotSettings } from '../../lib/booking/availability';
import { publicClient } from '../../lib/supabase';
import { isDateString, todayRiga } from '../../lib/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const serviceId = url.searchParams.get('service') ?? '';
  const master = url.searchParams.get('master') ?? 'any';
  const from = url.searchParams.get('from') ?? todayRiga();
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get('days') ?? 14) || 14));

  if (!UUID.test(serviceId) || (master !== 'any' && !UUID.test(master)) || !isDateString(from)) {
    return json({ error: 'invalid_input' }, 400);
  }

  try {
    const supabase = publicClient();
    const cat = await loadCatalogue(supabase);
    const service = cat.services.find((s) => s.id === serviceId);
    if (!service) return json({ error: 'service_not_found' }, 404);

    const masters = mastersForService(cat, serviceId).filter((m) => master === 'any' || m.id === master);
    if (masters.length === 0) return json({ error: 'master_not_found' }, 404);

    const busy = await loadBusy(supabase, from, days);
    const byDay = computeRangeSlots({
      fromDate: from,
      days,
      durationMin: service.duration_min,
      masterIds: masters.map((m) => m.id),
      workingHours: cat.workingHours,
      closedDays: new Set(cat.closedDays.keys()),
      busy,
      settings: toSlotSettings(cat.settings),
      now: new Date(),
    });

    return json({
      from,
      days: Object.entries(byDay).map(([date, slots]) => ({
        date,
        closed: cat.closedDays.has(date),
        slots: slots.map((s) => ({ time: s.time, start: s.start.toISOString(), masters: s.masterIds })),
      })),
      maxDaysAhead: cat.settings.max_days_ahead,
    });
  } catch (e) {
    console.error('[api/slots]', e);
    return json({ error: 'generic' }, 500);
  }
};
