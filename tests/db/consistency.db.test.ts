/**
 * The website shows slots computed in TypeScript; the database decides in
 * create_booking(). They must agree: every offered slot is bookable and every
 * grid time that is NOT offered is refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { computeDaySlots } from '../../src/lib/booking/slots';
import { toBusyIntervals, toSlotSettings, toWorkingIntervals } from '../../src/lib/booking/availability';
import { addDays, minutesToTime, rigaToUtc } from '../../src/lib/time';
import { connect, createBooking, createFixture, phone, type Fixture } from './helpers';

let db: pg.Client;
let fx: Fixture;
let day: string;

beforeAll(async () => {
  db = await connect();
  fx = await createFixture(db, 'consistency');
  day = fx.day(20);

  // Make the day interesting: split shift for A, bookings, a block, a buffer.
  await db.query(`delete from working_hours where master_id = $1`, [fx.masterA]);
  await db.query(
    `insert into working_hours (master_id, weekday, start_time, end_time)
     select $1, d, s::time, e::time from generate_series(1, 7) d, (values ('09:10', '12:00'), ('13:00', '17:30')) t(s, e)`,
    [fx.masterA],
  );
  await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('10:10', day) });
  await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterB, startsAt: fx.at('12:00', day) });
  await db.query(`insert into master_blocks (master_id, starts_at, ends_at) values ($1, $2, $3)`, [
    fx.masterB,
    fx.at('15:00', day),
    fx.at('16:30', day),
  ]);
  await db.query(`update settings set buffer_min = 10`);
});

afterAll(async () => {
  await db.query(`update settings set buffer_min = 0`);
  await db.query(`delete from master_blocks where master_id = any($1::uuid[])`, [[fx.masterA, fx.masterB]]);
  await fx?.cleanup();
  await db?.end();
});

async function tsSlots(masterIds: string[]) {
  const wh = await db.query(
    `select master_id, weekday, start_time::text, end_time::text from working_hours where master_id = any($1::uuid[])`,
    [masterIds],
  );
  const busy = await db.query(`select * from get_public_schedule($1, $2)`, [fx.at('00:00', day), fx.at('00:00', addDays(day, 1))]);
  const settings = await db.query(`select * from settings where id = 1`);
  const closed = await db.query(`select to_char(day, 'YYYY-MM-DD') as d from closed_days`);
  return computeDaySlots({
    date: day,
    durationMin: 60,
    masterIds,
    workingHours: toWorkingIntervals(wh.rows),
    closedDays: closed.rows.map((r) => r.d),
    busy: toBusyIntervals(busy.rows),
    settings: toSlotSettings(settings.rows[0]),
    now: new Date(),
  });
}

/** Try every 5-minute time of the day in a rolled-back savepoint. */
async function dbAccepts(masterId: string | null): Promise<string[]> {
  const accepted: string[] = [];
  await db.query('begin');
  try {
    for (let m = 6 * 60; m <= 20 * 60; m += 5) {
      const time = minutesToTime(m);
      await db.query('savepoint try_slot');
      try {
        await createBooking(db, { serviceId: fx.serviceId, masterId, startsAt: rigaToUtc(day, time), phone: phone() });
        accepted.push(time);
      } catch (e) {
        expect((e as Error).message).toBe('slot_unavailable');
      }
      await db.query('rollback to savepoint try_slot');
    }
  } finally {
    await db.query('rollback');
  }
  return accepted;
}

describe('TypeScript slots == database rules', () => {
  it('for a specific master (split shift, booking, buffer)', async () => {
    const offered = (await tsSlots([fx.masterA])).map((s) => s.time);
    expect(offered.length).toBeGreaterThan(5);
    expect(await dbAccepts(fx.masterA)).toEqual(offered);
  });

  it('for a master with a block', async () => {
    const offered = (await tsSlots([fx.masterB])).map((s) => s.time);
    expect(offered).not.toContain('15:00');
    expect(await dbAccepts(fx.masterB)).toEqual(offered);
  });

  it('for "any available master"', async () => {
    const offered = (await tsSlots([fx.masterA, fx.masterB])).map((s) => s.time);
    expect(await dbAccepts(null)).toEqual(offered);
  });
});
