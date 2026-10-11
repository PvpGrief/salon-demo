/**
 * Double booking under real concurrency: many separate database connections
 * try to book the same slot at the same moment. Exactly one may win per
 * master. This is enforced by the bookings_no_overlap exclusion constraint,
 * not by application code.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { addDays } from '../../src/lib/time';
import { connect, createBooking, createFixture, phone, type Fixture } from './helpers';

const PARALLEL = 12;

let db: pg.Client;
let fx: Fixture;
let pool: pg.Client[] = [];

beforeAll(async () => {
  db = await connect();
  fx = await createFixture(db, 'concurrency');
  pool = await Promise.all(Array.from({ length: PARALLEL }, () => connect()));
});

afterAll(async () => {
  await fx?.cleanup();
  await Promise.all(pool.map((c) => c.end()));
  await db?.end();
});

/**
 * Each connection runs BEGIN → create_booking → COMMIT on its own, all at the
 * same time. A loser waits for the winner's transaction, then gets
 * slot_unavailable (or picks another master in "any" mode).
 */
async function bookInTransaction(c: pg.Client, masterId: string | null, startsAt: Date) {
  await c.query('begin');
  try {
    const row = await createBooking(c, { serviceId: fx.serviceId, masterId, startsAt, phone: phone() });
    // Keep the transaction open a moment so the other requests surely run
    // while this one is still uncommitted (the worst case for double booking).
    await c.query('select pg_sleep(0.2)');
    await c.query('commit');
    return row;
  } catch (e) {
    await c.query('rollback');
    throw e;
  }
}

function race(masterId: string | null, startsAt: Date) {
  return Promise.allSettled(pool.map((c) => bookInTransaction(c, masterId, startsAt)));
}

describe('simultaneous bookings', () => {
  it(`${PARALLEL} parallel requests for the same master and time → exactly one succeeds`, async () => {
    const startsAt = fx.at('10:00', addDays(fx.date, 10));
    const results = await race(fx.masterA, startsAt);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(PARALLEL - 1);
    for (const f of failed) expect(String(f.reason?.message)).toContain('slot_unavailable');

    const rows = await db.query(
      `select count(*)::int as n from bookings where master_id = $1 and starts_at = $2 and status = 'confirmed'`,
      [fx.masterA, startsAt],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it(`${PARALLEL} parallel "any master" requests → one booking per master, never two on one`, async () => {
    const startsAt = fx.at('14:00', addDays(fx.date, 10));
    const results = await race(null, startsAt);

    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ master_id: string }>[];
    expect(ok).toHaveLength(2);
    expect(new Set(ok.map((r) => r.value.master_id))).toEqual(new Set([fx.masterA, fx.masterB]));
  });

  it('parallel requests for overlapping (not identical) times → only one survives', async () => {
    const day = addDays(fx.date, 11);
    const times = ['10:00', '10:15', '10:30', '10:45'];
    const results = await Promise.allSettled(
      pool.map((c, i) => bookInTransaction(c, fx.masterB, fx.at(times[i % times.length], day))),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await db.query(
      `select count(*)::int as n from bookings where master_id = $1 and status = 'confirmed'
         and starts_at >= $2 and starts_at < $3`,
      [fx.masterB, fx.at('00:00', day), fx.at('00:00', addDays(day, 1))],
    );
    expect(rows.rows[0].n).toBe(1);
  });
});
