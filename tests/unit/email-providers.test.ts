import { describe, expect, it } from 'vitest';
import { brevoRequest, chooseProvider, resendRequest, type OutgoingEmail } from '../../src/lib/email-providers';

describe('chooseProvider (EMAIL_PROVIDER)', () => {
  it('uses the explicitly chosen provider when its key is set', () => {
    expect(chooseProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_1', BREVO_API_KEY: 'b' })).toEqual({ provider: 'resend' });
    expect(chooseProvider({ EMAIL_PROVIDER: 'brevo', RESEND_API_KEY: 're_1', BREVO_API_KEY: 'b' })).toEqual({ provider: 'brevo' });
    expect(chooseProvider({ EMAIL_PROVIDER: ' Resend ', RESEND_API_KEY: 're_1' })).toEqual({ provider: 'resend' });
  });

  it('skips (with a reason) when the chosen provider has no key', () => {
    const c = chooseProvider({ EMAIL_PROVIDER: 'resend', BREVO_API_KEY: 'b' });
    expect(c.provider).toBeNull();
    expect(c.problem).toContain('RESEND_API_KEY');
  });

  it('rejects an unknown provider name', () => {
    const c = chooseProvider({ EMAIL_PROVIDER: 'mailgun', RESEND_API_KEY: 're_1' });
    expect(c.provider).toBeNull();
    expect(c.problem).toContain('not valid');
  });

  it('without EMAIL_PROVIDER picks whichever key exists (Resend first)', () => {
    expect(chooseProvider({ RESEND_API_KEY: 're_1', BREVO_API_KEY: 'b' })).toEqual({ provider: 'resend' });
    expect(chooseProvider({ BREVO_API_KEY: 'b' })).toEqual({ provider: 'brevo' });
  });

  it('no key at all → no provider, no error (e-mails are skipped)', () => {
    expect(chooseProvider({})).toEqual({ provider: null });
    expect(chooseProvider({ EMAIL_PROVIDER: '', RESEND_API_KEY: '  ' })).toEqual({ provider: null });
  });
});

const mail: OutgoingEmail = {
  from: { name: 'Salons Aurora', email: 'pieraksti@salons.lv' },
  to: [{ email: 'klients@example.lv', name: 'Ilze K.' }],
  replyTo: { email: 'info@salons.lv', name: 'Salons "Aurora"' },
  subject: 'Pieraksts apstiprināts',
  html: '<p>Sveiki</p>',
  text: 'Sveiki',
};

describe('Resend request', () => {
  it('matches the Resend API (POST /emails, Bearer auth, reply_to)', () => {
    const r = resendRequest(' re_test ', mail);
    expect(r.url).toBe('https://api.resend.com/emails');
    expect(r.init.method).toBe('POST');
    expect(r.init.headers.Authorization).toBe('Bearer re_test');
    expect(r.init.headers['User-Agent']).toBeTruthy();
    expect(JSON.parse(r.init.body)).toEqual({
      from: '"Salons Aurora" <pieraksti@salons.lv>',
      to: ['"Ilze K." <klients@example.lv>'],
      reply_to: '"Salons Aurora" <info@salons.lv>',
      subject: 'Pieraksts apstiprināts',
      html: '<p>Sveiki</p>',
      text: 'Sveiki',
    });
  });
});

describe('Brevo request', () => {
  it('matches the Brevo API (POST /v3/smtp/email, api-key header)', () => {
    const r = brevoRequest('xkeysib-1', mail);
    expect(r.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(r.init.headers['api-key']).toBe('xkeysib-1');
    expect(JSON.parse(r.init.body)).toEqual({
      sender: { name: 'Salons Aurora', email: 'pieraksti@salons.lv' },
      to: [{ email: 'klients@example.lv', name: 'Ilze K.' }],
      replyTo: { email: 'info@salons.lv', name: 'Salons "Aurora"' },
      subject: 'Pieraksts apstiprināts',
      htmlContent: '<p>Sveiki</p>',
      textContent: 'Sveiki',
    });
  });
});
