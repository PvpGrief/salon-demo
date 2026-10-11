import { describe, expect, it } from 'vitest';
import {
  computeDaySlots,
  computeRangeSlots,
  dayTimeline,
  type BusyInterval,
  type DaySlotsInput,
  type WorkingInterval,
} from '../../src/lib/booking/slots';
import { rigaToUtc } from '../../src/lib/time';

const A = 'master-a';
const B = 'master-b';

// Monday 12.10.2026; "now" is the Friday before, so min notice never interferes
// unless a test sets it explicitly.
const MONDAY = '2026-10-12';
const NOW = new Date('2026-10-09T08:00:00Z');

const settings = { slotStepMin: 15, bufferMin: 0, minNoticeMin: 120, maxDaysAhead: 60 };

function hours(masterId: string, weekday: number, start: string, end: string): WorkingInterval {
  return { masterId, weekday, start, end };
}

function booked(masterId: string, date: string, from: string, to: string): BusyInterval {
  return { masterId, start: rigaToUtc(date, from), end: rigaToUtc(date, to), kind: 'booked' };
}

function blocked(masterId: string, date: string, from: string, to: string): BusyInterval {
  return { masterId, start: rigaToUtc(date, from), end: rigaToUtc(date, to), kind: 'blocked' };
}

function input(overrides: Partial<DaySlotsInput> = {}): DaySlotsInput {
  return {
    date: MONDAY,
    durationMin: 60,
    masterIds: [A],
    workingHours: [hours(A, 1, '09:00', '12:00')],
    closedDays: [],
    busy: [],
    settings,
    now: NOW,
    ...overrides,
  };
}

const times = (slots: { time: string }[]) => slots.map((s) => s.time);

describe('computeDaySlots: working hours and duration', () => {
  it('generates grid slots that fully fit into working hours', () => {
    const slots = computeDaySlots(input());
    expect(times(slots)).toEqual([
      '09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00',
    ]);
    // last slot ends exactly at closing time
    expect(slots.at(-1)!.end.toISOString()).toBe(rigaToUtc(MONDAY, '12:00').toISOString());
  });

  it('returns nothing on a day the master does not work', () => {
    expect(computeDaySlots(input({ date: '2026-10-13' }))).toEqual([]); // Tuesday
  });

  it('returns nothing when the service is longer than the working interval', () => {
    expect(computeDaySlots(input({ durationMin: 240 }))).toEqual([]);
  });

  it('respects split shifts (lunch break) and never spans the break', () => {
    const slots = computeDaySlots(
      input({
        workingHours: [hours(A, 1, '09:00', '11:00'), hours(A, 1, '12:00', '13:00')],
        durationMin: 60,
        settings: { ...settings, slotStepMin: 30 },
      }),
    );
    expect(times(slots)).toEqual(['09:00', '09:30', '10:00', '12:00']);
  });

  it('aligns the grid to the start of each working interval', () => {
    const slots = computeDaySlots(
      input({ workingHours: [hours(A, 1, '09:10', '10:40')], settings: { ...settings, slotStepMin: 30 } }),
    );
    expect(times(slots)).toEqual(['09:10', '09:40']);
  });
});

describe('computeDaySlots: existing bookings', () => {
  it('excludes every slot that overlaps a booking', () => {
    const slots = computeDaySlots(input({ busy: [booked(A, MONDAY, '10:00', '11:00')] }));
    // a 60 min service cannot start 09:15–10:45
    expect(times(slots)).toEqual(['09:00', '11:00']);
  });

  it('allows back-to-back bookings (end == next start)', () => {
    const slots = computeDaySlots(input({ busy: [booked(A, MONDAY, '09:00', '10:00')] }));
    expect(times(slots)[0]).toBe('10:00');
  });

  it('ignores bookings of other masters', () => {
    const slots = computeDaySlots(input({ busy: [booked(B, MONDAY, '09:00', '12:00')] }));
    expect(slots).toHaveLength(9);
  });

  it('applies the buffer after the new booking', () => {
    // booking 10:30–11:00, buffer 15 → new 60 min slot at 09:15 would end 10:15 (+15 = 10:30) ok;
    // 09:30 would end 10:30 + 15 = 10:45 > 10:30 → conflict; 11:00 is free again
    const slots = computeDaySlots(
      input({
        busy: [booked(A, MONDAY, '10:30', '11:00')],
        settings: { ...settings, bufferMin: 15 },
      }),
    );
    expect(times(slots)).toEqual(['09:00', '09:15', '11:00']);
  });

  it('booking intervals already include their own buffer (blocked_until)', () => {
    // existing booking 09:00–10:00 with 15 min buffer arrives as 09:00–10:15
    const slots = computeDaySlots(
      input({ busy: [booked(A, MONDAY, '09:00', '10:15')], settings: { ...settings, bufferMin: 15 } }),
    );
    expect(times(slots)[0]).toBe('10:15');
  });
});

describe('computeDaySlots: blocks and closed days', () => {
  it('excludes slots overlapping a master block (vacation, lunch, sick day)', () => {
    const slots = computeDaySlots(input({ busy: [blocked(A, MONDAY, '09:30', '10:30')] }));
    expect(times(slots)).toEqual(['10:30', '10:45', '11:00']);
  });

  it('does not apply the buffer against blocks', () => {
    const slots = computeDaySlots(
      input({ busy: [blocked(A, MONDAY, '11:00', '12:00')], settings: { ...settings, bufferMin: 15 } }),
    );
    expect(times(slots).at(-1)).toBe('10:00'); // ends exactly when the block starts
  });

  it('a whole-day block removes all slots', () => {
    const slots = computeDaySlots(
      input({
        busy: [{ masterId: A, start: rigaToUtc(MONDAY, '00:00'), end: rigaToUtc('2026-10-13', '00:00'), kind: 'blocked' }],
      }),
    );
    expect(slots).toEqual([]);
  });

  it('a multi-day block (vacation) covers the days in between', () => {
    const slots = computeDaySlots(
      input({
        busy: [{ masterId: A, start: rigaToUtc('2026-10-10', '00:00'), end: rigaToUtc('2026-10-15', '00:00'), kind: 'blocked' }],
      }),
    );
    expect(slots).toEqual([]);
  });

  it('returns nothing on a closed day', () => {
    expect(computeDaySlots(input({ closedDays: [MONDAY] }))).toEqual([]);
  });
});

describe('computeDaySlots: notice period and horizon', () => {
  it('hides slots earlier than now + min notice', () => {
    const now = rigaToUtc(MONDAY, '08:30'); // + 120 min = 10:30
    expect(times(computeDaySlots(input({ now })))).toEqual(['10:30', '10:45', '11:00']);
  });

  it('hides past days', () => {
    expect(computeDaySlots(input({ now: new Date('2026-10-13T08:00:00Z') }))).toEqual([]);
  });

  it('hides days beyond max days ahead', () => {
    expect(computeDaySlots(input({ settings: { ...settings, maxDaysAhead: 2 } }))).toEqual([]);
    expect(computeDaySlots(input({ settings: { ...settings, maxDaysAhead: 3 } }))).toHaveLength(9);
  });

  it('admin mode ignores notice and horizon but not bookings', () => {
    const slots = computeDaySlots(
      input({
        now: rigaToUtc(MONDAY, '11:00'),
        busy: [booked(A, MONDAY, '09:00', '10:00')],
        ignoreNoticeAndHorizon: true,
      }),
    );
    expect(times(slots)[0]).toBe('10:00');
  });
});

describe('computeDaySlots: "any available master"', () => {
  it('merges slots of several masters and lists who is free', () => {
    const slots = computeDaySlots(
      input({
        masterIds: [A, B],
        workingHours: [hours(A, 1, '09:00', '11:00'), hours(B, 1, '10:00', '12:00')],
        busy: [booked(A, MONDAY, '09:00', '10:00')],
        settings: { ...settings, slotStepMin: 60 },
      }),
    );
    expect(slots.map((s) => [s.time, s.masterIds])).toEqual([
      ['10:00', [A, B]],
      ['11:00', [B]],
    ]);
  });

  it('a slot disappears only when every master is busy', () => {
    const slots = computeDaySlots(
      input({
        masterIds: [A, B],
        workingHours: [hours(A, 1, '09:00', '10:00'), hours(B, 1, '09:00', '10:00')],
        busy: [booked(A, MONDAY, '09:00', '10:00'), booked(B, MONDAY, '09:00', '10:00')],
      }),
    );
    expect(slots).toEqual([]);
  });
});

describe('computeDaySlots: daylight saving time', () => {
  it('produces correct instants on the spring-forward day', () => {
    // Sunday 29.03.2026
    const slots = computeDaySlots(
      input({
        date: '2026-03-29',
        workingHours: [hours(A, 7, '10:00', '12:00')],
        now: new Date('2026-03-20T00:00:00Z'),
        settings: { ...settings, slotStepMin: 60 },
      }),
    );
    expect(slots.map((s) => s.start.toISOString())).toEqual(['2026-03-29T07:00:00.000Z', '2026-03-29T08:00:00.000Z']);
  });

  it('produces correct instants on the fall-back day', () => {
    // Sunday 25.10.2026
    const slots = computeDaySlots(
      input({
        date: '2026-10-25',
        workingHours: [hours(A, 7, '10:00', '11:00')],
        settings: { ...settings, slotStepMin: 60 },
      }),
    );
    expect(slots.map((s) => s.start.toISOString())).toEqual(['2026-10-25T08:00:00.000Z']);
  });
});

describe('computeRangeSlots', () => {
  it('returns one entry per day', () => {
    const result = computeRangeSlots({ ...input(), fromDate: MONDAY, days: 7 });
    expect(Object.keys(result)).toHaveLength(7);
    expect(result[MONDAY]).toHaveLength(9);
    expect(result['2026-10-13']).toEqual([]);
  });
});

describe('dayTimeline (public availability view)', () => {
  it('splits working hours into busy and free windows', () => {
    const t = dayTimeline({
      date: MONDAY,
      masterId: A,
      workingHours: [hours(A, 1, '09:00', '12:00'), hours(A, 1, '13:00', '17:00')],
      closedDays: [],
      busy: [booked(A, MONDAY, '10:00', '11:00'), blocked(A, MONDAY, '16:00', '18:00')],
    });
    expect(t.free).toEqual([
      { start: 540, end: 600 },
      { start: 660, end: 720 },
      { start: 780, end: 960 },
    ]);
    expect(t.busy).toEqual([
      { start: 600, end: 660 },
      { start: 960, end: 1020 },
    ]);
  });

  it('shows nothing on closed days', () => {
    const t = dayTimeline({
      date: MONDAY,
      masterId: A,
      workingHours: [hours(A, 1, '09:00', '12:00')],
      closedDays: [MONDAY],
      busy: [],
    });
    expect(t.working).toEqual([]);
  });
});
