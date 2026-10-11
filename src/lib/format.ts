/** Small formatting helpers shared by the website and the admin panel. */
import { t } from '../config/texts';

const eur = (fractions: number) =>
  new Intl.NumberFormat('lv-LV', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fractions,
    maximumFractionDigits: 2,
  });

/** 35 → "35 €", 35.5 → "35,50 €" */
export function formatEuro(value: number): string {
  return eur(Number.isInteger(value) ? 0 : 2).format(value);
}

export function formatPrice(price: number | string | null | undefined, from = false): string {
  if (price === null || price === undefined || price === '') return t.services.priceOnRequest;
  const n = Number(price);
  return from ? `${t.services.priceFrom} ${formatEuro(n)}` : formatEuro(n);
}

/**
 * Normalize a phone number for storage: digits with optional leading '+'.
 * Latvian 8-digit numbers get +371. Returns null if it does not look valid.
 */
export function normalizePhone(input: string): string | null {
  let s = input.trim().replace(/[\s\-().\/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^[0-9]{8}$/.test(s)) s = '+371' + s;
  return /^\+?[0-9]{7,15}$/.test(s) ? s : null;
}

/** "+37120000000" → "+371 20 000 000" (display only) */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+371(\d{2})(\d{3})(\d{3})$/);
  return m ? `+371 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

export function telHref(phone: string): string {
  return 'tel:' + phone.replace(/[^\d+]/g, '');
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 254;
}
