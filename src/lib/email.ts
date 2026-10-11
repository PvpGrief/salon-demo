/**
 * Transactional e-mail via Brevo (https://www.brevo.com). OPTIONAL:
 * if BREVO_API_KEY is not set, every function returns { skipped: true } and
 * the rest of the site works normally. Failures are logged, never thrown.
 */
import { BREVO_API_KEY } from 'astro:env/server';
import { business } from '../config/business';
import { formatDateWithWeekday, formatDuration, toRigaDate, toRigaTime } from './time';

export type EmailResult = { sent: true } | { sent: false; skipped?: boolean; error?: string };

export function emailEnabled(): boolean {
  return Boolean(BREVO_API_KEY && business.email.fromAddress);
}

async function send(to: { email: string; name?: string }[], subject: string, html: string, text: string): Promise<EmailResult> {
  if (!emailEnabled()) return { sent: false, skipped: true };
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: business.email.fromName, email: business.email.fromAddress },
        to,
        replyTo: { email: business.contact.email, name: business.name },
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) {
      const error = `Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`;
      console.error('[email]', error);
      return { sent: false, error };
    }
    return { sent: true };
  } catch (e) {
    console.error('[email]', e);
    return { sent: false, error: String(e) };
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface BookingEmailData {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string;
  serviceName: string;
  masterName: string;
  startsAt: Date;
  durationMin?: number;
  comment?: string | null;
  cancelUrl?: string;
}

function layout(title: string, bodyHtml: string): string {
  const c = business.theme.primary;
  return `<!doctype html><html lang="lv"><body style="margin:0;background:#f5f2f0;font-family:Arial,Helvetica,sans-serif;color:#2b2326">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${c};color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">${esc(business.name)}</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;background:#faf7f5;font-size:13px;color:#6f6468">
${esc(business.contact.address.street)}, ${esc(business.contact.address.city)} · ${esc(business.contact.phone)} · ${esc(business.contact.email)}
</td></tr></table></td></tr></table></body></html>`;
}

function detailsTable(d: BookingEmailData): { html: string; text: string } {
  const date = formatDateWithWeekday(toRigaDate(d.startsAt));
  const time = toRigaTime(d.startsAt);
  const rows: [string, string][] = [
    ['Pakalpojums', d.serviceName],
    ['Meistars', d.masterName],
    ['Datums', date],
    ['Laiks', d.durationMin ? `${time} (${formatDuration(d.durationMin)})` : time],
    ['Adrese', `${business.contact.address.street}, ${business.contact.address.city}`],
  ];
  return {
    html:
      '<table role="presentation" cellpadding="6" style="border-collapse:collapse;font-size:15px;margin-bottom:16px">' +
      rows.map(([k, v]) => `<tr><td style="color:#6f6468">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('') +
      '</table>',
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

export async function sendBookingConfirmation(d: BookingEmailData): Promise<EmailResult> {
  if (!d.customerEmail) return { sent: false, skipped: true };
  const t = detailsTable(d);
  const cancel = d.cancelUrl
    ? `<p style="font-size:14px">${esc(business.booking.cancellationPolicy)}</p>
       <p><a href="${esc(d.cancelUrl)}" style="color:${business.theme.primary}">Atcelt pierakstu</a></p>`
    : '';
  const html = layout(
    'Jūsu pieraksts ir apstiprināts',
    `<p>Labdien, ${esc(d.customerName)}!</p><p>Paldies par pierakstu. Gaidīsim jūs:</p>${t.html}
     <p style="font-size:14px">${esc(business.booking.arrivalNote)}</p>${cancel}`,
  );
  const text = `Labdien, ${d.customerName}!\n\nJūsu pieraksts ir apstiprināts.\n\n${t.text}\n\n${business.booking.arrivalNote}\n${
    d.cancelUrl ? `\n${business.booking.cancellationPolicy}\nAtcelt: ${d.cancelUrl}\n` : ''
  }\n${business.name}, ${business.contact.phone}`;
  return send([{ email: d.customerEmail, name: d.customerName }], `Pieraksts apstiprināts – ${toRigaTime(d.startsAt)}, ${formatDateWithWeekday(toRigaDate(d.startsAt))}`, html, text);
}

export async function sendBookingChanged(d: BookingEmailData, kind: 'rescheduled' | 'cancelled'): Promise<EmailResult> {
  if (!d.customerEmail) return { sent: false, skipped: true };
  const t = detailsTable(d);
  const title = kind === 'cancelled' ? 'Jūsu pieraksts ir atcelts' : 'Jūsu pieraksts ir mainīts';
  const intro =
    kind === 'cancelled'
      ? 'Informējam, ka šis pieraksts ir atcelts:'
      : 'Informējam, ka jūsu pieraksts ir mainīts. Jaunais laiks:';
  const html = layout(
    title,
    `<p>Labdien, ${esc(d.customerName)}!</p><p>${intro}</p>${t.html}
     <p style="font-size:14px">Ja jums ir jautājumi, zvaniet: ${esc(business.contact.phone)}</p>`,
  );
  const text = `Labdien, ${d.customerName}!\n\n${intro}\n\n${t.text}\n\nJautājumi: ${business.contact.phone}`;
  return send([{ email: d.customerEmail, name: d.customerName }], title, html, text);
}

export async function notifyOwner(d: BookingEmailData, kind: 'new' | 'cancelled'): Promise<EmailResult> {
  const to = business.email.ownerNotifyTo;
  if (!to) return { sent: false, skipped: true };
  const t = detailsTable(d);
  const title = kind === 'new' ? 'Jauns pieraksts' : 'Klients atcēla pierakstu';
  const contact = `<p>Klients: <strong>${esc(d.customerName)}</strong><br>Tālrunis: ${esc(d.customerPhone ?? '')}${
    d.customerEmail ? `<br>E-pasts: ${esc(d.customerEmail)}` : ''
  }${d.comment ? `<br>Komentārs: ${esc(d.comment)}` : ''}</p>`;
  const html = layout(title, `${t.html}${contact}`);
  const text = `${title}\n\n${t.text}\n\nKlients: ${d.customerName}\nTālrunis: ${d.customerPhone ?? ''}${
    d.customerEmail ? `\nE-pasts: ${d.customerEmail}` : ''
  }${d.comment ? `\nKomentārs: ${d.comment}` : ''}`;
  return send([{ email: to }], `${title}: ${d.serviceName}, ${toRigaTime(d.startsAt)} ${formatDateWithWeekday(toRigaDate(d.startsAt))}`, html, text);
}
