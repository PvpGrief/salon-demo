import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatDate,
  formatDateTime,
  formatDateWithWeekday,
  formatDuration,
  isDateString,
  isoWeekday,
  rigaToUtc,
  startOfWeek,
  toRigaDate,
  toRigaTime,
} from '../../src/lib/time';

describe('time helpers (Europe/Riga)', () => {
  it('converts Riga wall-clock to UTC in winter (UTC+2) and summer (UTC+3)', () => {
    expect(rigaToUtc('2026-01-15', '10:00').toISOString()).toBe('2026-01-15T08:00:00.000Z');
    expect(rigaToUtc('2026-07-15', '10:00').toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('handles the DST change days', () => {
    // 29.03.2026: clocks go 03:00 → 04:00
    expect(rigaToUtc('2026-03-29', '10:00').toISOString()).toBe('2026-03-29T07:00:00.000Z');
    // 25.10.2026: clocks go 04:00 → 03:00
    expect(rigaToUtc('2026-10-25', '10:00').toISOString()).toBe('2026-10-25T08:00:00.000Z');
  });

  it('formats instants in Riga time, 24h, dd.mm.yyyy', () => {
    const d = new Date('2026-12-31T22:30:00Z'); // 01.01.2027 00:30 in Riga
    expect(toRigaDate(d)).toBe('2027-01-01');
    expect(toRigaTime(d)).toBe('00:30');
    expect(formatDate(d)).toBe('01.01.2027');
    expect(formatDateTime(new Date('2026-06-01T15:05:00Z'))).toBe('01.06.2026 18:05');
  });

  it('computes weekdays and date arithmetic', () => {
    expect(isoWeekday('2026-10-12')).toBe(1); // pirmdiena
    expect(isoWeekday('2026-10-18')).toBe(7); // svētdiena
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-11', '2026-10-25')).toBe(14);
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
    expect(formatDateWithWeekday('2026-10-12')).toBe('Pirmdiena, 12.10.2026');
  });

  it('validates date strings', () => {
    expect(isDateString('2026-02-28')).toBe(true);
    expect(isDateString('2026-02-30')).toBe(false);
    expect(isDateString('12.10.2026')).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
});
