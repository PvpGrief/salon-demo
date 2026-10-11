/** Small helpers for admin pages. */

const MASTER_COLORS = ['#8a4b5c', '#2f7d6d', '#c0873a', '#4a6fa5', '#8e6bb0', '#b5534b', '#5b8a3a', '#9a6a4f'];

/** Stable color per master (by display order) for calendar dots. */
export function masterColor(index: number): string {
  return MASTER_COLORS[index % MASTER_COLORS.length];
}

export const WEEKDAY_NAMES = ['Pirmdiena', 'Otrdiena', 'Trešdiena', 'Ceturtdiena', 'Piektdiena', 'Sestdiena', 'Svētdiena'];

/**
 * Working-hours rows of one weekday → form values (start, end, optional break).
 * Two intervals are shown as one day with a break.
 */
export function hoursToForm(rows: { start_time: string; end_time: string }[]) {
  const sorted = [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (sorted.length === 0) return { on: false, start: '09:00', end: '18:00', bstart: '', bend: '' };
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    on: true,
    start: first.start_time.slice(0, 5),
    end: last.end_time.slice(0, 5),
    bstart: sorted.length > 1 ? first.end_time.slice(0, 5) : '',
    bend: sorted.length > 1 ? sorted[1].start_time.slice(0, 5) : '',
  };
}
