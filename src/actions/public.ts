/**
 * Public actions: create a booking, cancel via e-mail link.
 * The database (create_booking) is the final authority on availability.
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { business } from '../config/business';
import { errorCode, errorText } from '../config/texts';
import { notifyOwner, sendBookingConfirmation } from '../lib/email';
import { normalizePhone } from '../lib/format';
import { rateLimited } from '../lib/rate-limit';
import { serviceClient } from '../lib/supabase';

function fail(code: string, status: 'BAD_REQUEST' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR' = 'BAD_REQUEST'): never {
  throw new ActionError({ code: status, message: errorText(code) });
}

export const createBooking = defineAction({
  input: z.object({
    serviceId: z.uuid(),
    masterId: z.uuid().nullable(),
    startsAt: z.iso.datetime({ offset: true }),
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    email: z.union([z.literal(''), z.email().max(254)]).optional(),
    comment: z.string().trim().max(1000).optional(),
    /** Honeypot – real visitors never fill it. */
    website: z.string().optional(),
  }),
  handler: async (input, context) => {
    if (input.website) fail('invalid_input');
    if (rateLimited(`book:${context.clientAddress}`, 8, 10 * 60_000)) fail('rate_limited', 'TOO_MANY_REQUESTS');

    const phone = normalizePhone(input.phone);
    if (!phone) fail('invalid_input');

    const supabase = serviceClient();
    const { data, error } = await supabase.rpc('create_booking', {
      p_service_id: input.serviceId,
      p_master_id: input.masterId,
      p_starts_at: input.startsAt,
      p_name: input.name,
      p_phone: phone,
      p_email: input.email || null,
      p_comment: input.comment || null,
    });

    if (error) {
      const code = errorCode(error.message);
      if (code === 'generic') console.error('[createBooking]', error);
      fail(code, code === 'slot_unavailable' ? 'CONFLICT' : code === 'generic' ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
    }

    const row = (Array.isArray(data) ? data[0] : data) as {
      id: string;
      master_id: string;
      starts_at: string;
      ends_at: string;
      cancel_token: string;
    };

    const [svc, master] = await Promise.all([
      supabase.from('services').select('name, duration_min').eq('id', input.serviceId).single(),
      supabase.from('masters').select('name').eq('id', row.master_id).single(),
    ]);
    const serviceName = svc.data?.name ?? '';
    const masterName = master.data?.name ?? '';
    const startsAt = new Date(row.starts_at);
    const cancelUrl = new URL(`/atcelt/${row.cancel_token}`, context.url.origin).href;

    const mail = {
      customerName: input.name,
      customerEmail: input.email || null,
      customerPhone: phone,
      serviceName,
      masterName,
      startsAt,
      durationMin: svc.data?.duration_min,
      comment: input.comment || null,
      cancelUrl,
    };
    // E-mail is optional and must never break a successful booking.
    const [confirmation] = await Promise.all([sendBookingConfirmation(mail), notifyOwner(mail, 'new')]);

    return {
      id: row.id,
      serviceName,
      masterName,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      emailSent: confirmation.sent,
      email: input.email || null,
      location: `${business.contact.address.street}, ${business.contact.address.city}`,
    };
  },
});

export const cancelBooking = defineAction({
  accept: 'form',
  input: z.object({ token: z.uuid() }),
  handler: async ({ token }, context) => {
    if (rateLimited(`cancel:${context.clientAddress}`, 10, 10 * 60_000)) fail('rate_limited', 'TOO_MANY_REQUESTS');
    const supabase = serviceClient();
    const { data, error } = await supabase.rpc('cancel_booking_by_token', { p_token: token });
    if (error) fail(errorCode(error.message));
    const row = (Array.isArray(data) ? data[0] : data) as {
      service_name: string;
      master_name: string;
      starts_at: string;
      customer_name: string;
      customer_email: string | null;
      customer_phone: string;
    };
    await notifyOwner(
      {
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        serviceName: row.service_name,
        masterName: row.master_name,
        startsAt: new Date(row.starts_at),
      },
      'cancelled',
    );
    return { ok: true };
  },
});
