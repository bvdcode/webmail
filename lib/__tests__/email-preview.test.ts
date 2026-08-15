import { describe, expect, it } from 'vitest';
import { normalizeEmailPreview } from '../email-preview';

describe('normalizeEmailPreview', () => {
  it('keeps ordinary preview text unchanged', () => {
    expect(normalizeEmailPreview('Your payment is scheduled for tomorrow.')).toBe(
      'Your payment is scheduled for tomorrow.',
    );
  });

  it('converts an HTML document stored as a plain-text preview', () => {
    const preview = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"><html><body><p>Передайте показания до 26 августа</p></body></html>';

    expect(normalizeEmailPreview(preview)).toBe('Передайте показания до 26 августа');
  });

  it('suppresses a truncated HTML header with no readable body text', () => {
    const preview = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN"><html><head><title></title><meta name="viewport"';

    expect(normalizeEmailPreview(preview)).toBe('');
  });

  it('does not mistake ordinary angle-bracket text for HTML', () => {
    expect(normalizeEmailPreview('<3 Thanks for your help')).toBe('<3 Thanks for your help');
  });
});
