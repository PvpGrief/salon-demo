/**
 * Transactional SMS via Brevo (same BREVO_API_KEY as e-mail). OPTIONAL:
 * without the key, with business.sms.enabled = false, without SMS credits or
 * for a landline number, nothing is sent and the booking still succeeds.
 * Failures are logged, never thrown.
 */
import { BREVO_API_KEY } from 'astro:env/server';
import { business } from '../config/business';
import { brevoSmsBody, isSmsCapable, smsText, type SmsKind } from './sms-text';

export type SmsResult = { sent: true } | { sent: false; skipped?: boolean; error?: string };

export function smsEnabled(): boolean {
  return Boolean(BREVO_API_KEY && business.sms.enabled && business.sms.sender);
}

export async function sendBookingSms(
  kind: SmsKind,
  data: { phone: string; startsAt: Date; cancelUrl?: string },
): Promise<SmsResult> {
  if (!smsEnabled() || !isSmsCapable(data.phone)) return { sent: false, skipped: true };
  const content = smsText(
    kind,
    { salonName: business.shortName, startsAt: data.startsAt, cancelUrl: data.cancelUrl, salonPhone: business.contact.phone },
    business.sms.plainLetters,
  );
  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(brevoSmsBody(business.sms.sender, data.phone, content)),
    });
    if (!res.ok) {
      const error = `Brevo SMS ${res.status}: ${(await res.text()).slice(0, 300)}`;
      console.error('[sms]', error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (e) {
    console.error('[sms]', e);
    return { sent: false, error: String(e) };
  }
}
