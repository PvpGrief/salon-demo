/**
 * Slot availability calculation (pure functions, no I/O).
 *
 * ⚠️ Booking-critical code. The same rules are enforced in the database by
 * public.fits_schedule() and public.create_booking()
 * (supabase/migrations/20261011000002_booking_functions.sql). If you change a
 * rule here, change it there too and run `npm test` + `npm run test:db`.
 *
 * Rules for a slot [start, end = start + duration) of one master:
 *   1. the local date is not a closed day and is not later than today + maxDaysAhead
 *   2. start >= now + minNoticeMin
 *   3. it lies completely inside one working-hours interval of that weekday,
 *      and start is on the grid: intervalStart + k * slotStepMin
 *   4. [start, end) does not overlap a master block
 *   5. [start, end + bufferMin) does not overlap an existing confirmed booking
 *      (bookings are given as [starts_at, blocked_until), which already
 *      includes their own buffer)
 */
import {
  addDays,
  diffDays,
  isoWeekday,
  minutesToTime,
  rigaMinutesOfDay,
  rigaToUtc,
  timeToMinutes,
  todayRiga,
} from '../time';

export interface WorkingInterval {
  masterId: string;
  /** ISO weekday, 1 = pirmdiena … 7 = svētdiena */
  weekday: number;
  /** 'HH:mm' or 'HH:mm:ss' local time */
  start: string;
  end: string;
}

export interface BusyInterval {
  masterId: string;
  start: Date;
  end: Date;
  /** booked = customer booking (end = blocked_until), blocked = master block */
  kind: 'booked' | 'blocked';
}

export interface SlotSettings {
  slotStepMin: number;
  bufferMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
}

export interface DaySlotsInput {
  /** Local Riga date 'YYYY-MM-DD' */
  date: string;
  durationMin: number;
  /** Masters that offer the service and are active (already filtered). */
  masterIds: string[];
  workingHours: WorkingInterval[];
  closedDays: Iterable<string>;
  busy: BusyInterval[];
  settings: SlotSettings;
  now: Date;
  /** Admin mode ignores min notice and max days ahead. */
  ignoreNoticeAndHorizon?: boolean;
}

export interface Slot {
  /** Local 'HH:mm' */
  time: string;
  start: Date;
  end: Date;
  /** Masters free for this slot, in the order given by masterIds. */
  masterIds: string[];
}

const MINUTE = 60_000;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** Is the date bookable at all (not closed, inside the horizon)? */
export function isDateOpen(
  date: string,
  closedDays: Iterable<string>,
  settings: Pick<SlotSettings, 'maxDaysAhead'>,
  now: Date,
  ignoreHorizon = false,
): boolean {
  const closed = closedDays instanceof Set ? closedDays : new Set(closedDays);
  if (closed.has(date)) return false;
  if (ignoreHorizon) return true;
  const offset = diffDays(todayRiga(now), date);
  return offset >= 0 && offset <= settings.maxDaysAhead;
}

/** All free slots of one day, merged across the given masters. */
export function computeDaySlots(input: DaySlotsInput): Slot[] {
  const { date, durationMin, masterIds, workingHours, busy, settings, now } = input;
  const ignore = input.ignoreNoticeAndHorizon ?? false;

  if (durationMin <= 0 || settings.slotStepMin <= 0) return [];
  if (!isDateOpen(date, input.closedDays, settings, now, ignore)) return [];

  const weekday = isoWeekday(date);
  const earliest = ignore ? -Infinity : now.getTime() + settings.minNoticeMin * MINUTE;
  const bySlot = new Map<string, Slot>();

  for (const masterId of masterIds) {
    const intervals = workingHours.filter((w) => w.masterId === masterId && w.weekday === weekday);
    const masterBusy = busy.filter((b) => b.masterId === masterId);

    for (const wh of intervals) {
      const whStart = timeToMinutes(wh.start);
      const whEnd = timeToMinutes(wh.end);

      for (let t = whStart; t + durationMin <= whEnd; t += settings.slotStepMin) {
        const time = minutesToTime(t);
        const start = rigaToUtc(date, time);
        const startMs = start.getTime();
        if (startMs < earliest) continue;

        const endMs = startMs + durationMin * MINUTE;
        const protectedEndMs = endMs + settings.bufferMin * MINUTE;

        const conflict = masterBusy.some((b) =>
          b.kind === 'blocked'
            ? overlaps(startMs, endMs, b.start.getTime(), b.end.getTime())
            : overlaps(startMs, protectedEndMs, b.start.getTime(), b.end.getTime()),
        );
        if (conflict) continue;

        const existing = bySlot.get(time);
        if (existing) {
          if (!existing.masterIds.includes(masterId)) existing.masterIds.push(masterId);
        } else {
          bySlot.set(time, { time, start, end: new Date(endMs), masterIds: [masterId] });
        }
      }
    }
  }

  const order = new Map(masterIds.map((id, i) => [id, i]));
  return [...bySlot.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((s) => ({ ...s, masterIds: s.masterIds.sort((a, b) => order.get(a)! - order.get(b)!) }));
}

/** Slots for several consecutive days. */
export function computeRangeSlots(
  input: Omit<DaySlotsInput, 'date'> & { fromDate: string; days: number },
): Record<string, Slot[]> {
  const result: Record<string, Slot[]> = {};
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromDate, i);
    result[date] = computeDaySlots({ ...input, date });
  }
  return result;
}

export interface TimeWindow {
  /** minutes since local midnight */
  start: number;
  end: number;
}

/**
 * For the public availability view: a master's working windows and busy
 * windows on one date, in local minutes. Busy windows are clipped to the day.
 */
export function dayTimeline(params: {
  date: string;
  masterId: string;
  workingHours: WorkingInterval[];
  closedDays: Iterable<string>;
  busy: BusyInterval[];
}): { working: TimeWindow[]; busy: TimeWindow[]; free: TimeWindow[] } {
  const { date, masterId } = params;
  const closed = params.closedDays instanceof Set ? params.closedDays : new Set(params.closedDays);
  if (closed.has(date)) return { working: [], busy: [], free: [] };

  const weekday = isoWeekday(date);
  const working = params.workingHours
    .filter((w) => w.masterId === masterId && w.weekday === weekday)
    .map((w) => ({ start: timeToMinutes(w.start), end: timeToMinutes(w.end) }))
    .sort((a, b) => a.start - b.start);

  const dayStart = rigaToUtc(date, '00:00').getTime();
  const dayEnd = rigaToUtc(addDays(date, 1), '00:00').getTime();
  const busy = params.busy
    .filter((b) => b.masterId === masterId && overlaps(b.start.getTime(), b.end.getTime(), dayStart, dayEnd))
    // Wall-clock minutes (correct on DST change days too).
    .map((b) => ({
      start: b.start.getTime() <= dayStart ? 0 : rigaMinutesOfDay(b.start),
      end: b.end.getTime() >= dayEnd ? 24 * 60 : rigaMinutesOfDay(b.end),
    }))
    .sort((a, b) => a.start - b.start);

  // free = working minus busy
  const free: TimeWindow[] = [];
  for (const w of working) {
    let cursor = w.start;
    for (const b of busy) {
      if (b.end <= cursor || b.start >= w.end) continue;
      if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, w.end) });
      cursor = Math.max(cursor, b.end);
      if (cursor >= w.end) break;
    }
    if (cursor < w.end) free.push({ start: cursor, end: w.end });
  }

  // Clip busy to working windows for display.
  const busyInWork: TimeWindow[] = [];
  for (const b of busy) {
    for (const w of working) {
      const s = Math.max(b.start, w.start);
      const e = Math.min(b.end, w.end);
      if (e > s) busyInWork.push({ start: s, end: e });
    }
  }

  return { working, busy: busyInWork, free };
}
