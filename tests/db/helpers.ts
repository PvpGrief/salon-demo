/**
 * Helpers for database tests. They talk directly to the local Supabase
 * Postgres started with `npx supabase start` (port 54322).
 *
 * Every test file creates its own masters/services (names start with
 * "TEST ") on a date far enough ahead, and removes them afterwards, so the
 * demo seed data is never touched.
 */
import pg from 'pg';
import { addDays, rigaToUtc, todayRiga } from '../../src/lib/time';

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export function newClient() {
  return new pg.Client({ connectionString: DATABASE_URL });
}

export async function connect() {
  const c = newClient();
  await c.connect();
  return c;
}

export interface Fixture {
  serviceId: string;
  shortServiceId: string;
  masterA: string;
  masterB: string;
  /** a free, open local date ~20 days ahead */
  date: string;
  at: (time: string, date?: string) => Date;
  cleanup: () => Promise<void>;
}

/**
 * Two masters (A, B) working every day 09:00–18:00, both offering a 60 min
 * service; A also offers a 30 min service.
 */
export async function createFixture(db: pg.Client, label: string): Promise<Fixture> {
  const svc = await db.query(
    `insert into services (name, duration_min, price_eur) values ($1, 60, 10) returning id`,
    [`TEST ${label} 60`],
  );
  const shortSvc = await db.query(
    `insert into services (name, duration_min, price_eur) values ($1, 30, 10) returning id`,
    [`TEST ${label} 30`],
  );
  const masters = await db.query(
    `insert into masters (name, sort_order) values ($1, 900), ($2, 901) returning id`,
    [`TEST ${label} A`, `TEST ${label} B`],
  );
  const [masterA, masterB] = masters.rows.map((r) => r.id as string);
  const serviceId = svc.rows[0].id as string;
  const shortServiceId = shortSvc.rows[0].id as string;

  await db.query(
    `insert into master_services (master_id, service_id) values ($1, $3), ($2, $3), ($1, $4)`,
    [masterA, masterB, serviceId, shortServiceId],
  );
  await db.query(
    `insert into working_hours (master_id, weekday, start_time, end_time)
     select m, d, '09:00', '18:00' from unnest($1::uuid[]) m, generate_series(1, 7) d`,
    [[masterA, masterB]],
  );

  // pick a date ~20 days ahead that is not a closed day
  const closed = new Set(
    (await db.query(`select to_char(day, 'YYYY-MM-DD') as d from closed_days`)).rows.map((r) => r.d),
  );
  let date = addDays(todayRiga(), 20);
  while (closed.has(date)) date = addDays(date, 1);

  return {
    serviceId,
    shortServiceId,
    masterA,
    masterB,
    date,
    at: (time, d = date) => rigaToUtc(d, time),
    cleanup: async () => {
      await db.query(`delete from bookings where master_id = any($1::uuid[])`, [[masterA, masterB]]);
      await db.query(`delete from masters where id = any($1::uuid[])`, [[masterA, masterB]]);
      await db.query(`delete from services where id = any($1::uuid[])`, [[serviceId, shortServiceId]]);
    },
  };
}

let phoneCounter = 0;
/** Unique phone per booking so the per-phone limit never interferes. */
export function phone(): string {
  phoneCounter += 1;
  return `+3712${String(Date.now() % 1000).padStart(3, '0')}${String(phoneCounter).padStart(4, '0')}`;
}

export async function createBooking(
  db: pg.Client,
  args: {
    serviceId: string;
    masterId: string | null;
    startsAt: Date;
    name?: string;
    phone?: string;
    email?: string | null;
  },
) {
  const res = await db.query(
    `select * from create_booking($1, $2, $3, $4, $5, $6, null)`,
    [
      args.serviceId,
      args.masterId,
      args.startsAt,
      args.name ?? 'Testa Klients',
      args.phone ?? phone(),
      args.email ?? null,
    ],
  );
  return res.rows[0] as { id: string; master_id: string; starts_at: Date; ends_at: Date; cancel_token: string };
}

/** Run fn as a Supabase API role inside a transaction that is rolled back. */
export async function asRole<T>(
  db: pg.Client,
  role: 'anon' | 'authenticated',
  fn: () => Promise<T>,
  userId?: string,
): Promise<T> {
  await db.query('begin');
  try {
    if (userId) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role }),
      ]);
    }
    await db.query(`set local role ${role}`);
    return await fn();
  } finally {
    await db.query('rollback');
  }
}

export async function expectDbError(promise: Promise<unknown>, match: string | RegExp) {
  try {
    await promise;
  } catch (e) {
    const msg = (e as Error).message;
    if (typeof match === 'string' ? msg.includes(match) : match.test(msg)) return;
    throw new Error(`Expected DB error matching ${match}, got: ${msg}`);
  }
  throw new Error(`Expected DB error matching ${match}, but the query succeeded`);
}
