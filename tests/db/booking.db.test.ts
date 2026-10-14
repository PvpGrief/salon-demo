import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { addDays, todayRiga, rigaToUtc } from '../../src/lib/time';
import { connect, createBooking, createFixture, expectDbError, phone, type Fixture } from './helpers';

let db: pg.Client;
let fx: Fixture;

beforeAll(async () => {
  db = await connect();
  fx = await createFixture(db, 'booking');
});

afterAll(async () => {
  await fx?.cleanup();
  await db?.end();
});

describe('create_booking: basic rules', () => {
  it('books a free slot and computes the end time from the service duration', async () => {
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('09:00') });
    expect(b.master_id).toBe(fx.masterA);
    expect(b.starts_at.toISOString()).toBe(fx.at('09:00').toISOString());
    expect(b.ends_at.toISOString()).toBe(fx.at('10:00').toISOString());
    expect(b.cancel_token).toMatch(/[0-9a-f-]{36}/);
  });

  it('rejects the exact same slot again', async () => {
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('09:00') }),
      'slot_unavailable',
    );
  });

  it('rejects a partially overlapping slot', async () => {
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('09:30') }),
      'slot_unavailable',
    );
  });

  it('allows a back-to-back booking', async () => {
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('10:00') });
    expect(b.master_id).toBe(fx.masterA);
  });

  it('rejects times outside working hours and off the slot grid', async () => {
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('17:30') }), // ends 18:30
      'slot_unavailable',
    );
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('08:00') }),
      'slot_unavailable',
    );
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('12:07') }),
      'slot_unavailable',
    );
  });

  it('rejects a master who does not offer the service', async () => {
    await expectDbError(
      createBooking(db, { serviceId: fx.shortServiceId, masterId: fx.masterB, startsAt: fx.at('12:00') }),
      'master_not_found',
    );
  });

  it('rejects bookings on a closed day', async () => {
    const day = fx.day(1);
    await db.query(`insert into closed_days (day, reason) values ($1, 'TEST')`, [day]);
    try {
      await expectDbError(
        createBooking(db, { serviceId: fx.serviceId, masterId: null, startsAt: fx.at('12:00', day) }),
        'slot_unavailable',
      );
    } finally {
      await db.query(`delete from closed_days where day = $1`, [day]);
    }
  });

  it('rejects bookings overlapping a master block', async () => {
    await db.query(`insert into master_blocks (master_id, starts_at, ends_at, reason) values ($1, $2, $3, 'TEST')`, [
      fx.masterB,
      fx.at('13:00'),
      fx.at('14:00'),
    ]);
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterB, startsAt: fx.at('12:30') }),
      'slot_unavailable',
    );
    const ok = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterB, startsAt: fx.at('14:00') });
    expect(ok.master_id).toBe(fx.masterB);
  });

  it('enforces the minimum notice and the booking horizon', async () => {
    const today = todayRiga();
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: new Date(Date.now() + 30 * 60_000) }),
      'too_soon',
    );
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: rigaToUtc(addDays(today, 61), '12:00') }),
      'too_far',
    );
  });

  it('validates customer input', async () => {
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('15:00'), phone: 'abc' }),
      'invalid_input',
    );
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('15:00'), name: ' ' }),
      'invalid_input',
    );
    await expectDbError(
      createBooking(db, {
        serviceId: fx.serviceId,
        masterId: fx.masterA,
        startsAt: fx.at('15:00'),
        email: 'not-an-email',
      }),
      'invalid_input',
    );
  });

  it('normalizes the phone number', async () => {
    const b = await createBooking(db, {
      serviceId: fx.serviceId,
      masterId: fx.masterA,
      startsAt: fx.at('16:00'),
      phone: '+371 2 999-88 77',
    });
    const row = await db.query(`select customer_phone from bookings where id = $1`, [b.id]);
    expect(row.rows[0].customer_phone).toBe('+37129998877');
  });

  it('limits active future bookings per phone number', async () => {
    const day = fx.day(2);
    const p = phone();
    for (const t of ['09:00', '10:00', '11:00']) {
      await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at(t, day), phone: p });
    }
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('12:00', day), phone: p }),
      'too_many_bookings',
    );
  });
});

describe('create_booking: "any available master"', () => {
  it('assigns different masters to the same time until all are taken', async () => {
    const day = fx.day(3);
    const first = await createBooking(db, { serviceId: fx.serviceId, masterId: null, startsAt: fx.at('11:00', day) });
    const second = await createBooking(db, { serviceId: fx.serviceId, masterId: null, startsAt: fx.at('11:00', day) });
    expect(new Set([first.master_id, second.master_id])).toEqual(new Set([fx.masterA, fx.masterB]));
    await expectDbError(
      createBooking(db, { serviceId: fx.serviceId, masterId: null, startsAt: fx.at('11:00', day) }),
      'slot_unavailable',
    );
  });

  it('prefers the master with fewer bookings that day', async () => {
    const day = fx.day(4);
    await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('09:00', day) });
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: null, startsAt: fx.at('15:00', day) });
    expect(b.master_id).toBe(fx.masterB);
  });
});

describe('cancellation frees the slot', () => {
  it('a cancelled booking no longer blocks the time', async () => {
    const day = fx.day(5);
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('10:00', day) });
    await db.query(`update bookings set status = 'cancelled' where id = $1`, [b.id]);
    const again = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('10:00', day) });
    expect(again.id).not.toBe(b.id);
    const row = await db.query(`select cancelled_at from bookings where id = $1`, [b.id]);
    expect(row.rows[0].cancelled_at).not.toBeNull();
  });

  it('re-activating a cancelled booking over a taken slot is refused by the constraint', async () => {
    const day = fx.day(5);
    const cancelled = await db.query(
      `select id from bookings where master_id = $1 and status = 'cancelled' and starts_at = $2`,
      [fx.masterA, fx.at('10:00', day)],
    );
    await expectDbError(
      db.query(`update bookings set status = 'confirmed' where id = $1`, [cancelled.rows[0].id]),
      'bookings_no_overlap',
    );
  });
});

describe('cancel_booking_by_token', () => {
  it('cancels via the secret token and refuses a second time', async () => {
    const day = fx.day(6);
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterB, startsAt: fx.at('09:00', day) });
    const info = await db.query(`select * from get_booking_by_token($1)`, [b.cancel_token]);
    expect(info.rows[0].can_cancel).toBe(true);
    const res = await db.query(`select * from cancel_booking_by_token($1)`, [b.cancel_token]);
    expect(res.rows[0].id).toBe(b.id);
    await expectDbError(db.query(`select * from cancel_booking_by_token($1)`, [b.cancel_token]), 'booking_not_found');
  });

  it('refuses to cancel later than settings.cancel_hours before the start', async () => {
    const day = fx.day(6);
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterB, startsAt: fx.at('12:00', day) });
    await db.query(`update settings set cancel_hours = 720`); // 30 days
    try {
      await expectDbError(db.query(`select * from cancel_booking_by_token($1)`, [b.cancel_token]), 'cancel_too_late');
    } finally {
      await db.query(`update settings set cancel_hours = 24`);
    }
  });
});

describe('buffer between bookings', () => {
  it('keeps settings.buffer_min free after each booking', async () => {
    const day = fx.day(7);
    await db.query(`update settings set buffer_min = 15`);
    try {
      await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('10:00', day) });
      await expectDbError(
        createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('11:00', day) }),
        'slot_unavailable',
      );
      await expectDbError(
        createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('09:00', day) }),
        'slot_unavailable',
      );
      const ok = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('11:15', day) });
      expect(ok.master_id).toBe(fx.masterA);
    } finally {
      await db.query(`update settings set buffer_min = 0`);
    }
  });
});

describe('database constraint (also protects admin edits)', () => {
  it('a direct insert that overlaps is rejected by bookings_no_overlap', async () => {
    const day = fx.day(8);
    await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('13:00', day) });
    await expectDbError(
      db.query(
        `insert into bookings (service_id, master_id, starts_at, ends_at, blocked_until, customer_name, customer_phone, source)
         values ($1, $2, $3, $4, $4, 'Admins', '+37120000000', 'admin')`,
        [fx.serviceId, fx.masterA, fx.at('13:30', day), fx.at('14:30', day)],
      ),
      'bookings_no_overlap',
    );
  });

  it('rescheduling onto a taken time is rejected', async () => {
    const day = fx.day(8);
    const b = await createBooking(db, { serviceId: fx.serviceId, masterId: fx.masterA, startsAt: fx.at('15:00', day) });
    await expectDbError(
      db.query(`update bookings set starts_at = $2, ends_at = $3 where id = $1`, [
        b.id,
        fx.at('13:30', day),
        fx.at('14:30', day),
      ]),
      'bookings_no_overlap',
    );
  });
});
