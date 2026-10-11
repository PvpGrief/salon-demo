/**
 * Time helpers. The business always runs in Europe/Riga; every date shown to
 * people is dd.mm.yyyy and every time is 24h HH:mm.
 *
 * Conventions used across the app:
 *   - "date string"  = local Riga calendar date 'YYYY-MM-DD'
 *   - "time string"  = local Riga wall-clock time 'HH:mm'
 *   - Date objects   = absolute instants (stored as timestamptz in the DB)
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const TZ = 'Europe/Riga';

export const WEEKDAYS_LV = [
  'pirmdiena',
  'otrdiena',
  'trešdiena',
  'ceturtdiena',
  'piektdiena',
  'sestdiena',
  'svētdiena',
] as const;

export const WEEKDAYS_SHORT_LV = ['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'] as const;

export const MONTHS_LV = [
  'janvāris',
  'februāris',
  'marts',
  'aprīlis',
  'maijs',
  'jūnijs',
  'jūlijs',
  'augusts',
  'septembris',
  'oktobris',
  'novembris',
  'decembris',
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Local Riga date + time → absolute instant. */
export function rigaToUtc(date: string, time: string): Date {
  const hhmm = time.slice(0, 5);
  return fromZonedTime(`${date}T${hhmm}:00`, TZ);
}

/** Instant → local Riga date string 'YYYY-MM-DD'. */
export function toRigaDate(instant: Date): string {
  return formatInTimeZone(instant, TZ, 'yyyy-MM-dd');
}

/** Instant → local Riga time 'HH:mm'. */
export function toRigaTime(instant: Date): string {
  return formatInTimeZone(instant, TZ, 'HH:mm');
}

/** Minutes since local midnight for an instant (Riga). */
export function rigaMinutesOfDay(instant: Date): number {
  const [h, m] = toRigaTime(instant).split(':').map(Number);
  return h * 60 + m;
}

/** 'HH:mm[:ss]' → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** minutes since midnight → 'HH:mm'. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Today's date in Riga. */
export function todayRiga(now: Date = new Date()): string {
  return toRigaDate(now);
}

/** Add calendar days to a date string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** ISO weekday of a date string: 1 = pirmdiena … 7 = svētdiena. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

/** Monday of the week containing the date. */
export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** 'YYYY-MM-DD' → 'dd.mm.yyyy'. */
export function formatDate(date: string | Date): string {
  const s = typeof date === 'string' ? date : toRigaDate(date);
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

/** 'dd.mm.' without year, for compact lists. */
export function formatDateShort(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}.${m}.`;
}

/** Instant → 'dd.mm.yyyy HH:mm' in Riga. */
export function formatDateTime(instant: Date): string {
  return `${formatDate(instant)} ${toRigaTime(instant)}`;
}

/** 'Pirmdiena, 12.10.2026' */
export function formatDateWithWeekday(date: string): string {
  const wd = WEEKDAYS_LV[isoWeekday(date) - 1];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${formatDate(date)}`;
}

export function weekdayName(date: string): string {
  return WEEKDAYS_LV[isoWeekday(date) - 1];
}

export function weekdayShort(date: string): string {
  return WEEKDAYS_SHORT_LV[isoWeekday(date) - 1];
}

/** Duration in minutes → '1 h 30 min' */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
