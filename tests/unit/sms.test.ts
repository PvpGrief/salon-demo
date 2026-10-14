import { describe, expect, it } from 'vitest';
import { brevoSmsBody, isSmsCapable, smsSegments, smsText, toPlainLetters } from '../../src/lib/sms-text';
import { rigaToUtc } from '../../src/lib/time';

const data = {
  salonName: 'Aurora',
  startsAt: rigaToUtc('2026-10-15', '11:00'),
  cancelUrl: 'https://salon-demo.example.workers.dev/atcelt/0b7c6a52-3f7e-4d38-9c4e-2f1d2a7b9e10',
  salonPhone: '+371 20 000 000',
};

describe('SMS texts', () => {
  it('builds the confirmation with Riga date/time and the cancel link', () => {
    expect(smsText('confirmation', data, false)).toBe(
      `Aurora: pieraksts 15.10.2026 plkst. 11:00 apstiprināts. Atcelt: ${data.cancelUrl}`,
    );
  });

  it('plain-letter mode removes Latvian diacritics and fits in one SMS', () => {
    const text = smsText('confirmation', data, true);
    expect(text).toContain('apstiprinats');
    expect(/[^\x00-\x7F]/.test(text)).toBe(false);
    expect(smsSegments(text)).toBe(1);
  });

  it('with diacritics the same message costs more SMS', () => {
    expect(smsSegments(smsText('confirmation', data, false))).toBeGreaterThan(1);
  });

  it('cancellation text contains the salon phone and no link', () => {
    const text = smsText('cancelled', { ...data, cancelUrl: undefined }, true);
    expect(text).toBe('Aurora: jusu pieraksts 15.10.2026 plkst. 11:00 ir atcelts. Talr. +371 20 000 000');
  });

  it('converts all Latvian letters and typographic characters', () => {
    expect(toPlainLetters('ĀČĒĢĪĶĻŅŠŪŽ āčēģīķļņšūž „x” – y')).toBe('ACEGIKLNSUZ acegiklnsuz "x" - y');
  });
});

describe('SMS recipients', () => {
  it('sends to Latvian mobiles (+3712…) but not landlines', () => {
    expect(isSmsCapable('+37129123456')).toBe(true);
    expect(isSmsCapable('+37167123456')).toBe(false);
    expect(isSmsCapable('+3712912345')).toBe(false);
  });
  it('attempts foreign numbers', () => {
    expect(isSmsCapable('+37251234567')).toBe(true);
    expect(isSmsCapable('abc')).toBe(false);
  });
});

describe('Brevo request body', () => {
  it('matches the transactionalSMS/send contract', () => {
    expect(brevoSmsBody('Salons Aurora!', '+371 29 123 456', 'Sveiki')).toEqual({
      sender: 'SalonsAuror',
      recipient: '+37129123456',
      content: 'Sveiki',
      type: 'transactional',
      unicodeEnabled: false,
      tag: 'pieraksts',
    });
    expect(brevoSmsBody('Aurora', '+37129123456', 'Pieraksts apstiprināts').unicodeEnabled).toBe(true);
  });
});
