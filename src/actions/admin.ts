/**
 * Admin actions (used by the forms in /admin). Every handler checks the
 * session + admin_users itself; RLS in the database enforces the same rules,
 * so even a bug here cannot expose or change data for non-admins.
 */
import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendBookingChanged, sendBookingConfirmation } from '../lib/email';
import { sendBookingSms } from '../lib/sms';
import { normalizePhone } from '../lib/format';
import { authClient } from '../lib/supabase';
import { addDays, isDateString, isTimeString, rigaToUtc, timeToMinutes } from '../lib/time';
import { rateLimited } from '../lib/rate-limit';

// ------------------------------------------------------------------ helpers

function fail(message: string, code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' = 'BAD_REQUEST'): never {
  throw new ActionError({ code, message });
}

async function requireAdmin(context: ActionAPIContext): Promise<SupabaseClient> {
  const supabase = context.locals.supabase ?? authClient(context.request, context.cookies);
  if (context.locals.user) return supabase;
  const { data } = await supabase.auth.getUser();
  if (!data.user) fail('Lūdzu, piesakieties vēlreiz.', 'UNAUTHORIZED');
  const { data: ok } = await supabase.rpc('is_admin');
  if (!ok) fail('Jums nav piekļuves.', 'FORBIDDEN');
  return supabase;
}

/** Turn a Postgres error into a Latvian message for the admin. */
function dbFail(error: { message: string; code?: string }): never {
  const m = error.message ?? '';
  if (m.includes('bookings_no_overlap') || error.code === '23P01') {
    if (m.includes('working_hours')) fail('Darba laika intervāli pārklājas.', 'CONFLICT');
    fail('Šim meistaram šajā laikā jau ir cits pieraksts. Izvēlieties citu laiku vai meistaru.', 'CONFLICT');
  }
  if (m.includes('working_hours_no_overlap')) fail('Darba laika intervāli pārklājas.', 'CONFLICT');
  if (error.code === '23503') fail('Nevar dzēst: ierakstam ir saistīti pieraksti. Deaktivizējiet to.', 'CONFLICT');
  if (error.code === '23505') fail('Šāds ieraksts jau eksistē.', 'CONFLICT');
  if (error.code === '23514' || error.code === '22P02' || error.code === '22007') fail('Lūdzu, pārbaudiet ievadītos datus.');
  console.error('[admin]', error);
  fail('Radās kļūda. Mēģiniet vēlreiz.');
}

const uuid = z.uuid();
const dateStr = z.string().refine(isDateString, 'Nederīgs datums');
const timeStr = z.string().refine(isTimeString, 'Nederīgs laiks');
const text = (max: number) => z.string().trim().max(max).optional();

// ------------------------------------------------------------------ auth

const login = defineAction({
  accept: 'form',
  input: z.object({ email: z.email(), password: z.string().min(1).max(200), next: z.string().optional() }),
  handler: async ({ email, password, next }, context) => {
    if (rateLimited(`login:${context.clientAddress}`, 10, 15 * 60_000)) fail('Pārāk daudz mēģinājumu. Uzgaidiet 15 minūtes.');
    const supabase = authClient(context.request, context.cookies);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail('Nepareizs e-pasts vai parole.', 'UNAUTHORIZED');
    const { data: ok } = await supabase.rpc('is_admin');
    if (!ok) {
      await supabase.auth.signOut();
      fail('Šim lietotājam nav administratora tiesību.', 'FORBIDDEN');
    }
    const safeNext = next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
    return { next: safeNext };
  },
});

const logout = defineAction({
  accept: 'form',
  handler: async (_input, context) => {
    const supabase = authClient(context.request, context.cookies);
    await supabase.auth.signOut();
    return { ok: true };
  },
});

const changePassword = defineAction({
  accept: 'form',
  input: z.object({ password: z.string().min(10, 'Parolei jābūt vismaz 10 rakstzīmēm').max(200), password2: z.string() }),
  handler: async ({ password, password2 }, context) => {
    const supabase = await requireAdmin(context);
    if (password !== password2) fail('Paroles nesakrīt.');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) fail(error.message.includes('weak') ? 'Parole ir pārāk vāja.' : 'Neizdevās nomainīt paroli.');
    return { ok: true };
  },
});

// ------------------------------------------------------------------ bookings

const bookingInput = z.object({
  id: uuid.optional(),
  serviceId: uuid,
  masterId: uuid,
  date: dateStr,
  time: timeStr,
  durationMin: z.number().int().min(5).max(600).optional(),
  name: z.string().trim().min(2, 'Ievadiet vārdu').max(100),
  phone: z.string().trim().min(7, 'Ievadiet tālruni').max(30),
  email: z.union([z.literal(''), z.email('Nederīgs e-pasts').max(254)]).optional(),
  comment: text(1000),
  notify: z.boolean().optional(),
});

const saveBooking = defineAction({
  accept: 'form',
  input: bookingInput,
  handler: async (input, context) => {
    const supabase = await requireAdmin(context);
    const phone = normalizePhone(input.phone);
    if (!phone) fail('Nederīgs tālruņa numurs.');

    const { data: svc } = await supabase.from('services').select('name, duration_min').eq('id', input.serviceId).single();
    if (!svc) fail('Pakalpojums nav atrasts.');
    const { data: master } = await supabase.from('masters').select('name').eq('id', input.masterId).single();
    if (!master) fail('Meistars nav atrasts.');

    const duration = input.durationMin ?? svc.duration_min;
    const startsAt = rigaToUtc(input.date, input.time);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    let previous: { starts_at: string; master_id: string; status: string } | null = null;
    if (input.id) {
      const { data } = await supabase.from('bookings').select('starts_at, master_id, status').eq('id', input.id).single();
      previous = data;
    }

    const row = {
      service_id: input.serviceId,
      master_id: input.masterId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      // blocked_until (end + buffer) is set by the database trigger
      customer_name: input.name,
      customer_phone: phone,
      customer_email: input.email || null,
      comment: input.comment || null,
    };

    const res = input.id
      ? await supabase.from('bookings').update(row).eq('id', input.id).select('id, cancel_token').single()
      : await supabase.from('bookings').insert({ ...row, source: 'admin' }).select('id, cancel_token').single();
    if (res.error) dbFail(res.error);

    if (input.notify) {
      const cancelUrl = new URL(`/atcelt/${res.data.cancel_token}`, context.url.origin).href;
      const mail = {
        customerName: input.name,
        customerEmail: input.email || null,
        serviceName: svc.name,
        masterName: master.name,
        startsAt,
        durationMin: duration,
        cancelUrl,
      };
      const moved = previous && (new Date(previous.starts_at).getTime() !== startsAt.getTime() || previous.master_id !== input.masterId);
      // E-mail (if given) and SMS (if enabled); both skip silently when not configured.
      if (!input.id) {
        await Promise.all([sendBookingConfirmation(mail), sendBookingSms('confirmation', { phone, startsAt, cancelUrl })]);
      } else if (moved) {
        await Promise.all([sendBookingChanged(mail, 'rescheduled'), sendBookingSms('rescheduled', { phone, startsAt, cancelUrl })]);
      }
    }
    return { id: res.data.id as string, created: !input.id };
  },
});

const setBookingStatus = defineAction({
  accept: 'form',
  input: z.object({ id: uuid, status: z.enum(['confirmed', 'cancelled']), notify: z.boolean().optional() }),
  handler: async ({ id, status, notify }, context) => {
    const supabase = await requireAdmin(context);
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select('customer_name, customer_email, customer_phone, starts_at, ends_at, services(name), masters(name)')
      .single();
    if (error) dbFail(error);
    if (status === 'cancelled' && notify) {
      const rel = data as unknown as { services: { name: string }; masters: { name: string } };
      const startsAt = new Date(data.starts_at);
      await Promise.all([
        sendBookingChanged(
          {
            customerName: data.customer_name,
            customerEmail: data.customer_email,
            serviceName: rel.services?.name ?? '',
            masterName: rel.masters?.name ?? '',
            startsAt,
          },
          'cancelled',
        ),
        sendBookingSms('cancelled', { phone: data.customer_phone, startsAt }),
      ]);
    }
    return { status };
  },
});

const deleteBooking = defineAction({
  accept: 'form',
  input: z.object({ id: uuid }),
  handler: async ({ id }, context) => {
    const supabase = await requireAdmin(context);
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) dbFail(error);
    return { ok: true };
  },
});

// ------------------------------------------------------------------ closed days & blocks

const addClosedDays = defineAction({
  accept: 'form',
  input: z.object({ from: dateStr, to: dateStr.optional(), reason: text(200) }),
  handler: async ({ from, to, reason }, context) => {
    const supabase = await requireAdmin(context);
    const end = to && to >= from ? to : from;
    const days: { day: string; reason: string }[] = [];
    for (let d = from; d <= end && days.length < 366; d = addDays(d, 1)) days.push({ day: d, reason: reason ?? '' });
    const { error } = await supabase.from('closed_days').upsert(days, { onConflict: 'day' });
    if (error) dbFail(error);
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gte('starts_at', rigaToUtc(from, '00:00').toISOString())
      .lt('starts_at', rigaToUtc(addDays(end, 1), '00:00').toISOString());
    return { days: days.length, conflicts: count ?? 0 };
  },
});

const deleteClosedDay = defineAction({
  accept: 'form',
  input: z.object({ day: dateStr }),
  handler: async ({ day }, context) => {
    const supabase = await requireAdmin(context);
    const { error } = await supabase.from('closed_days').delete().eq('day', day);
    if (error) dbFail(error);
    return { ok: true };
  },
});

const addBlock = defineAction({
  accept: 'form',
  input: z.object({
    masterId: uuid,
    from: dateStr,
    to: dateStr.optional(),
    allDay: z.boolean().optional(),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    reason: text(200),
  }),
  handler: async (input, context) => {
    const supabase = await requireAdmin(context);
    const to = input.to && input.to >= input.from ? input.to : input.from;
    let startsAt: Date;
    let endsAt: Date;
    if (input.allDay || (!input.startTime && !input.endTime)) {
      startsAt = rigaToUtc(input.from, '00:00');
      endsAt = rigaToUtc(addDays(to, 1), '00:00');
    } else {
      if (!input.startTime || !input.endTime) fail('Norādiet sākuma un beigu laiku vai atzīmējiet „Visa diena”.');
      startsAt = rigaToUtc(input.from, input.startTime);
      endsAt = rigaToUtc(to, input.endTime);
      if (to === input.from && timeToMinutes(input.endTime) <= timeToMinutes(input.startTime)) fail('Beigu laikam jābūt pēc sākuma laika.');
    }
    if (endsAt <= startsAt) fail('Beigu laikam jābūt pēc sākuma laika.');

    const { error } = await supabase.from('master_blocks').insert({
      master_id: input.masterId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: input.reason ?? '',
    });
    if (error) dbFail(error);
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('master_id', input.masterId)
      .eq('status', 'confirmed')
      .lt('starts_at', endsAt.toISOString())
      .gt('ends_at', startsAt.toISOString());
    return { conflicts: count ?? 0 };
  },
});

const deleteBlock = defineAction({
  accept: 'form',
  input: z.object({ id: uuid }),
  handler: async ({ id }, context) => {
    const supabase = await requireAdmin(context);
    const { error } = await supabase.from('master_blocks').delete().eq('id', id);
    if (error) dbFail(error);
    return { ok: true };
  },
});

// ------------------------------------------------------------------ masters

/** Working-hours fields: wh{d}_on, wh{d}_start, wh{d}_end, wh{d}_bstart, wh{d}_bend for d = 1..7 */
const hourFields: Record<string, z.ZodType> = {};
for (let d = 1; d <= 7; d++) {
  hourFields[`wh${d}_on`] = z.boolean().optional();
  hourFields[`wh${d}_start`] = timeStr.optional();
  hourFields[`wh${d}_end`] = timeStr.optional();
  hourFields[`wh${d}_bstart`] = timeStr.optional();
  hourFields[`wh${d}_bend`] = timeStr.optional();
}

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

const saveMaster = defineAction({
  accept: 'form',
  input: z.object({
    id: uuid.optional(),
    name: z.string().trim().min(1, 'Ievadiet vārdu').max(80),
    title: text(80),
    bio: text(1000),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(-9999).max(9999).optional(),
    serviceIds: z.array(uuid).optional(),
    photo: z.instanceof(File).optional(),
    removePhoto: z.boolean().optional(),
    ...hourFields,
  }),
  handler: async (input, context) => {
    const supabase = await requireAdmin(context);
    const f = input as Record<string, unknown>;

    // Working hours → intervals (a break splits the day in two).
    const hours: { weekday: number; start: string; end: string }[] = [];
    for (let d = 1; d <= 7; d++) {
      if (!f[`wh${d}_on`]) continue;
      const start = f[`wh${d}_start`] as string | undefined;
      const end = f[`wh${d}_end`] as string | undefined;
      const bs = f[`wh${d}_bstart`] as string | undefined;
      const be = f[`wh${d}_bend`] as string | undefined;
      if (!start || !end || timeToMinutes(end) <= timeToMinutes(start)) fail('Pārbaudiet darba laiku: beigām jābūt pēc sākuma.');
      if (bs && be) {
        if (!(timeToMinutes(start) < timeToMinutes(bs) && timeToMinutes(bs) < timeToMinutes(be) && timeToMinutes(be) < timeToMinutes(end))) {
          fail('Pārtraukumam jābūt darba laika iekšpusē.');
        }
        hours.push({ weekday: d, start, end: bs }, { weekday: d, start: be, end });
      } else {
        hours.push({ weekday: d, start, end });
      }
    }

    const row: Record<string, unknown> = {
      name: input.name,
      title: input.title ?? '',
      bio: input.bio ?? '',
      active: input.active ?? false,
      sort_order: input.sortOrder ?? 0,
    };
    if (input.removePhoto) row.photo_url = null;

    const res = input.id
      ? await supabase.from('masters').update(row).eq('id', input.id).select('id').single()
      : await supabase.from('masters').insert(row).select('id').single();
    if (res.error) dbFail(res.error);
    const id = res.data.id as string;

    const photo = input.photo;
    if (photo && photo.size > 0 && !input.removePhoto) {
      const ext = PHOTO_TYPES[photo.type];
      if (!ext) fail('Foto jābūt JPG, PNG, WebP vai AVIF formātā.');
      if (photo.size > MAX_PHOTO) fail('Foto ir par lielu (maks. 5 MB).');
      const path = `masters/${id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('media').upload(path, photo, { contentType: photo.type, cacheControl: '31536000' });
      if (up.error) {
        console.error('[admin] upload', up.error);
        fail('Neizdevās augšupielādēt foto.');
      }
      const url = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
      await supabase.from('masters').update({ photo_url: url }).eq('id', id);
    }

    const { error } = await supabase.rpc('set_master_schedule', {
      p_master_id: id,
      p_service_ids: input.serviceIds ?? [],
      p_hours: hours,
    });
    if (error) dbFail(error);
    return { id, created: !input.id };
  },
});

const deleteMaster = defineAction({
  accept: 'form',
  input: z.object({ id: uuid }),
  handler: async ({ id }, context) => {
    const supabase = await requireAdmin(context);
    const { error } = await supabase.from('masters').delete().eq('id', id);
    if (error) dbFail(error);
    return { ok: true };
  },
});

// ------------------------------------------------------------------ services

const saveService = defineAction({
  accept: 'form',
  input: z.object({
    id: uuid.optional(),
    name: z.string().trim().min(1, 'Ievadiet nosaukumu').max(120),
    category: text(60),
    description: text(1000),
    durationMin: z.number({ error: 'Norādiet ilgumu' }).int().min(5).max(600),
    price: z.string().trim().max(12).optional(),
    priceFrom: z.boolean().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(-9999).max(9999).optional(),
  }),
  handler: async (input, context) => {
    const supabase = await requireAdmin(context);
    let price: number | null = null;
    if (input.price) {
      price = Number(input.price.replace(',', '.').replace(/[^\d.]/g, ''));
      if (!Number.isFinite(price) || price < 0) fail('Nederīga cena.');
    }
    const row = {
      name: input.name,
      category: input.category ?? '',
      description: input.description ?? '',
      duration_min: input.durationMin,
      price_eur: price,
      price_from: input.priceFrom ?? false,
      active: input.active ?? false,
      sort_order: input.sortOrder ?? 0,
    };
    const res = input.id
      ? await supabase.from('services').update(row).eq('id', input.id).select('id').single()
      : await supabase.from('services').insert(row).select('id').single();
    if (res.error) dbFail(res.error);
    return { id: res.data.id as string, created: !input.id };
  },
});

const deleteService = defineAction({
  accept: 'form',
  input: z.object({ id: uuid }),
  handler: async ({ id }, context) => {
    const supabase = await requireAdmin(context);
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) dbFail(error);
    return { ok: true };
  },
});

// ------------------------------------------------------------------ settings

const saveSettings = defineAction({
  accept: 'form',
  input: z.object({
    slotStepMin: z.number().int().min(5).max(120),
    bufferMin: z.number().int().min(0).max(120),
    minNoticeMin: z.number().int().min(0).max(10080),
    maxDaysAhead: z.number().int().min(1).max(365),
    cancelHours: z.number().int().min(0).max(720),
    maxActivePerPhone: z.number().int().min(1).max(50),
    retentionMonths: z.number().int().min(1).max(120),
  }),
  handler: async (s, context) => {
    const supabase = await requireAdmin(context);
    const { error } = await supabase
      .from('settings')
      .update({
        slot_step_min: s.slotStepMin,
        buffer_min: s.bufferMin,
        min_notice_min: s.minNoticeMin,
        max_days_ahead: s.maxDaysAhead,
        cancel_hours: s.cancelHours,
        max_active_per_phone: s.maxActivePerPhone,
        retention_months: s.retentionMonths,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) dbFail(error);
    return { ok: true };
  },
});

const anonymizeOld = defineAction({
  accept: 'form',
  handler: async (_input, context) => {
    const supabase = await requireAdmin(context);
    const { data, error } = await supabase.rpc('anonymize_old_bookings');
    if (error) dbFail(error);
    return { count: Number(data ?? 0) };
  },
});

export const admin = {
  login,
  logout,
  changePassword,
  saveBooking,
  setBookingStatus,
  deleteBooking,
  addClosedDays,
  deleteClosedDay,
  addBlock,
  deleteBlock,
  saveMaster,
  deleteMaster,
  saveService,
  deleteService,
  saveSettings,
  anonymizeOld,
};
