/**
 * E-mail providers (pure, unit-tested): which provider to use and the HTTP
 * request each one needs. Sending happens in ./email.ts.
 *
 *   EMAIL_PROVIDER=resend  + RESEND_API_KEY   (recommended; works from Cloudflare Workers)
 *   EMAIL_PROVIDER=brevo   + BREVO_API_KEY    (needs "Authorised IPs" blocking turned off)
 *   EMAIL_PROVIDER unset   → Resend if RESEND_API_KEY is set, else Brevo if BREVO_API_KEY is set
 *   no key                 → e-mails are skipped, the site works normally
 */

export type EmailProvider = 'resend' | 'brevo';

export interface EmailEnv {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
}

export interface ProviderChoice {
  provider: EmailProvider | null;
  /** Human-readable reason when no provider is active (shown in /admin/iestatijumi, logged). */
  problem?: string;
}

const has = (v: string | undefined) => Boolean(v && v.trim());

export function chooseProvider(env: EmailEnv): ProviderChoice {
  const wanted = (env.EMAIL_PROVIDER ?? '').trim().toLowerCase();

  if (wanted === 'resend') {
    return has(env.RESEND_API_KEY) ? { provider: 'resend' } : { provider: null, problem: 'EMAIL_PROVIDER=resend, but RESEND_API_KEY is not set' };
  }
  if (wanted === 'brevo') {
    return has(env.BREVO_API_KEY) ? { provider: 'brevo' } : { provider: null, problem: 'EMAIL_PROVIDER=brevo, but BREVO_API_KEY is not set' };
  }
  if (wanted) {
    return { provider: null, problem: `EMAIL_PROVIDER="${wanted}" is not valid (use resend or brevo)` };
  }
  if (has(env.RESEND_API_KEY)) return { provider: 'resend' };
  if (has(env.BREVO_API_KEY)) return { provider: 'brevo' };
  return { provider: null };
}

export interface OutgoingEmail {
  from: { name: string; email: string };
  to: { email: string; name?: string }[];
  replyTo?: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

export interface HttpRequest {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
}

/** "Name" <address> with characters that would break the header removed. */
function mailbox(m: { email: string; name?: string }): string {
  const name = (m.name ?? '').replace(/["<>\r\n]/g, '').trim();
  return name ? `"${name}" <${m.email}>` : m.email;
}

/** https://resend.com/docs/api-reference/emails/send-email */
export function resendRequest(apiKey: string, mail: OutgoingEmail): HttpRequest {
  return {
    url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'salon-booking-template/1.0',
      },
      body: JSON.stringify({
        from: mailbox(mail.from),
        to: mail.to.map(mailbox),
        ...(mail.replyTo ? { reply_to: mailbox(mail.replyTo) } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    },
  };
}

/** https://developers.brevo.com/reference/sendtransacemail */
export function brevoRequest(apiKey: string, mail: OutgoingEmail): HttpRequest {
  return {
    url: 'https://api.brevo.com/v3/smtp/email',
    init: {
      method: 'POST',
      headers: { 'api-key': apiKey.trim(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: mail.from.name, email: mail.from.email },
        to: mail.to,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
    },
  };
}

export function buildRequest(provider: EmailProvider, env: EmailEnv, mail: OutgoingEmail): HttpRequest {
  return provider === 'resend' ? resendRequest(env.RESEND_API_KEY!, mail) : brevoRequest(env.BREVO_API_KEY!, mail);
}
