/**
 * Row Level Security: the public (anon) and logged-in non-admin users must not
 * be able to read customer data or change bookings. Only admins can.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { addDays } from '../../src/lib/time';
import { asRole, connect, createBooking, createFixture, expectDbError, type Fixture } from './helpers';

let db: pg.Client;
let fx: Fixture;
let booking: { id: string; cancel_token: string };
const adminId = randomUUID();
const userId = randomUUID();

beforeAll(async () => {
  db = await connect();
  fx = await createFixture(db, 'security');
  booking = await createBooking(db, {
    serviceId: fx.serviceId,
    masterId: fx.masterA,
    startsAt: fx.at('10:00', fx.day(15)),
    name: 'Slepena Persona',
    email: 'slepena@example.com',
  });
  await db.query(`insert into master_blocks (master_id, starts_at, ends_at, reason) values ($1, $2, $3, 'Slimības lapa')`, [
    fx.masterA,
    fx.at('14:00', fx.day(15)),
    fx.at('15:00', fx.day(15)),
  ]);
  for (const [id, email] of [
    [adminId, `admin-${adminId}@test.local`],
    [userId, `user-${userId}@test.local`],
  ]) {
    await db.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now())`,
      [id, email],
    );
  }
  await db.query(`insert into admin_users (user_id) values ($1)`, [adminId]);
});

afterAll(async () => {
  await db.query(`delete from master_blocks where master_id = $1`, [fx.masterA]);
  await db.query(`delete from auth.users where id = any($1::uuid[])`, [[adminId, userId]]);
  await fx?.cleanup();
  await db?.end();
});

describe('anonymous visitor (anon key)', () => {
  it('cannot read bookings', async () => {
    await asRole(db, 'anon', () => expectDbError(db.query('select * from bookings'), 'permission denied'));
  });

  it('cannot insert, update or delete bookings', async () => {
    await asRole(db, 'anon', () =>
      expectDbError(
        db.query(
          `insert into bookings (service_id, master_id, starts_at, ends_at, blocked_until, customer_name, customer_phone)
           values ($1, $2, now() + interval '30 days', now() + interval '30 days 1 hour', now() + interval '30 days 1 hour', 'X Y', '+37120000000')`,
          [fx.serviceId, fx.masterA],
        ),
        'permission denied',
      ),
    );
    await asRole(db, 'anon', () =>
      expectDbError(db.query(`update bookings set status = 'cancelled' where id = $1`, [booking.id]), 'permission denied'),
    );
    await asRole(db, 'anon', () =>
      expectDbError(db.query(`delete from bookings where id = $1`, [booking.id]), 'permission denied'),
    );
  });

  it('cannot call server-only functions', async () => {
    await asRole(db, 'anon', () =>
      expectDbError(
        db.query(`select * from create_booking($1, $2, now() + interval '20 days', 'X Y', '+37120000000')`, [
          fx.serviceId,
          fx.masterA,
        ]),
        'permission denied',
      ),
    );
    await asRole(db, 'anon', () =>
      expectDbError(db.query(`select * from get_booking_by_token($1)`, [booking.cancel_token]), 'permission denied'),
    );
    await asRole(db, 'anon', () =>
      expectDbError(db.query(`select * from cancel_booking_by_token($1)`, [booking.cancel_token]), 'permission denied'),
    );
  });

  it('cannot read master blocks (reasons may be private)', async () => {
    await asRole(db, 'anon', () => expectDbError(db.query('select * from master_blocks'), 'permission denied'));
  });

  it('cannot change services, masters or settings', async () => {
    await asRole(db, 'anon', () =>
      expectDbError(db.query(`update services set price_eur = 0 where id = $1`, [fx.serviceId]), 'permission denied'),
    );
    await asRole(db, 'anon', () => expectDbError(db.query(`update settings set buffer_min = 0`), 'permission denied'));
    await asRole(db, 'anon', () =>
      expectDbError(db.query(`delete from masters where id = $1`, [fx.masterA]), 'permission denied'),
    );
  });

  it('can read the public catalogue', async () => {
    const services = await asRole(db, 'anon', () => db.query('select id, name from services where id = $1', [fx.serviceId]));
    expect(services.rows).toHaveLength(1);
    const masters = await asRole(db, 'anon', () => db.query('select id from masters where id = $1', [fx.masterA]));
    expect(masters.rows).toHaveLength(1);
  });

  it('sees inactive services/masters as non-existent', async () => {
    await db.query(`update services set active = false where id = $1`, [fx.shortServiceId]);
    try {
      const r = await asRole(db, 'anon', () => db.query('select id from services where id = $1', [fx.shortServiceId]));
      expect(r.rows).toHaveLength(0);
    } finally {
      await db.query(`update services set active = true where id = $1`, [fx.shortServiceId]);
    }
  });

  it('gets only busy intervals from get_public_schedule – no names, phones or reasons', async () => {
    const day = fx.day(15);
    const r = await asRole(db, 'anon', () =>
      db.query(`select * from get_public_schedule($1, $2) where master_id = $3`, [
        fx.at('00:00', day),
        fx.at('00:00', addDays(day, 1)),
        fx.masterA,
      ]),
    );
    expect(r.fields.map((f) => f.name).sort()).toEqual(['ends_at', 'kind', 'master_id', 'starts_at']);
    expect(r.rows.map((x) => x.kind).sort()).toEqual(['blocked', 'booked']);
    const json = JSON.stringify(r.rows);
    expect(json).not.toContain('Slepena');
    expect(json).not.toContain('Slimības');
  });

  it('cannot read admin_users', async () => {
    await asRole(db, 'anon', () => expectDbError(db.query('select * from admin_users'), 'permission denied'));
  });
});

describe('logged-in user who is NOT an admin', () => {
  it('sees no bookings and cannot write', async () => {
    const r = await asRole(db, 'authenticated', () => db.query('select * from bookings'), userId);
    expect(r.rows).toHaveLength(0);
    await asRole(
      db,
      'authenticated',
      () =>
        expectDbError(
          db.query(`update bookings set customer_name = 'Hacked' where id = $1 returning id`, [booking.id]).then((x) => {
            if (x.rowCount === 0) throw new Error('row-level security: no rows updated');
          }),
          'row-level security',
        ),
      userId,
    );
    await asRole(
      db,
      'authenticated',
      () => expectDbError(db.query(`insert into closed_days (day) values ('2030-01-01')`), 'row-level security'),
      userId,
    );
  });

  it('cannot make themselves admin', async () => {
    await asRole(
      db,
      'authenticated',
      () => expectDbError(db.query(`insert into admin_users (user_id) values ($1)`, [userId]), 'permission denied'),
      userId,
    );
  });
});

describe('admin user', () => {
  it('reads bookings with customer details', async () => {
    const r = await asRole(
      db,
      'authenticated',
      () => db.query('select customer_name, customer_email from bookings where id = $1', [booking.id]),
      adminId,
    );
    expect(r.rows[0]).toEqual({ customer_name: 'Slepena Persona', customer_email: 'slepena@example.com' });
  });

  it('can edit, block and manage the catalogue', async () => {
    await asRole(
      db,
      'authenticated',
      async () => {
        const u = await db.query(`update bookings set comment = 'Admins' where id = $1`, [booking.id]);
        expect(u.rowCount).toBe(1);
        await db.query(`insert into closed_days (day, reason) values ('2030-01-02', 'TEST')`);
        await db.query(`update services set price_eur = 12 where id = $1`, [fx.serviceId]);
        await db.query(`update settings set slot_step_min = 30`);
        const blocks = await db.query('select reason from master_blocks where master_id = $1', [fx.masterA]);
        expect(blocks.rows[0].reason).toBe('Slimības lapa');
      },
      adminId,
    );
  });

  it('cannot bypass the double-booking constraint either', async () => {
    await asRole(
      db,
      'authenticated',
      () =>
        expectDbError(
          db.query(
            `insert into bookings (service_id, master_id, starts_at, ends_at, blocked_until, customer_name, customer_phone, source)
             values ($1, $2, $3, $4, $4, 'Admins', '+37120000000', 'admin')`,
            [fx.serviceId, fx.masterA, fx.at('10:30', fx.day(15)), fx.at('11:00', fx.day(15))],
          ),
          'bookings_no_overlap',
        ),
      adminId,
    );
  });
});
