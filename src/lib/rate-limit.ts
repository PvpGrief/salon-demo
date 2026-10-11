/**
 * Tiny best-effort in-memory rate limiter (per server instance). It slows
 * down obvious abuse; the real protection against booking spam is the
 * per-phone limit in create_booking() (settings.max_active_per_phone).
 */
const hits = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}
