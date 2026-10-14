/**
 * Pure SMS helpers (no I/O, unit-tested): message texts, plain-letter
 * conversion, mobile-number check and the Brevo request body.
 */
import { t } from '../config/texts';
import { formatDate, toRigaTime } from './time';

const PLAIN: Record<string, string> = {
  ā: 'a', č: 'c', ē: 'e', ģ: 'g', ī: 'i', ķ: 'k', ļ: 'l', ņ: 'n', š: 's', ū: 'u', ž: 'z',
  Ā: 'A', Č: 'C', Ē: 'E', Ģ: 'G', Ī: 'I', Ķ: 'K', Ļ: 'L', Ņ: 'N', Š: 'S', Ū: 'U', Ž: 'Z',
  '–': '-', '—': '-', '„': '"', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', ' ': ' ',
};

/** Latvian diacritics and typographic characters → plain GSM-friendly text. */
export function toPlainLetters(text: string): string {
  return text
    .replace(/[^\x00-\x7F]/g, (c) => PLAIN[c] ?? c.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .replace(/[^\x00-\x7F]/g, '?');
}

/** Number of SMS a text costs: 160/153 chars plain, 70/67 with Unicode. */
export function smsSegments(text: string): number {
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/**
 * Can this number receive SMS? Latvian (+371) mobile numbers start with 2;
 * Latvian landlines (6…) cannot. Foreign numbers are attempted.
 */
export function isSmsCapable(phone: string): boolean {
  const p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+371')) return /^\+3712\d{7}$/.test(p);
  return /^\+?\d{8,15}$/.test(p);
}

export type SmsKind = keyof typeof t.sms;

export function smsText(
  kind: SmsKind,
  data: { salonName: string; startsAt: Date; cancelUrl?: string; salonPhone: string },
  plainLetters: boolean,
): string {
  const text = t.sms[kind]
    .replace('{name}', data.salonName)
    .replace('{date}', formatDate(data.startsAt))
    .replace('{time}', toRigaTime(data.startsAt))
    .replace('{link}', data.cancelUrl ?? '')
    .replace('{phone}', data.salonPhone);
  return plainLetters ? toPlainLetters(text) : text;
}

/** Body for POST https://api.brevo.com/v3/transactionalSMS/send */
export function brevoSmsBody(sender: string, phone: string, content: string) {
  return {
    sender: sender.replace(/[^A-Za-z0-9]/g, '').slice(0, 11),
    recipient: phone.replace(/[^\d+]/g, ''),
    content,
    type: 'transactional',
    unicodeEnabled: /[^\x00-\x7F]/.test(content),
    tag: 'pieraksts',
  };
}
