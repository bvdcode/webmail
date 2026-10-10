import { describe, expect, it } from 'vitest';
import { getStalwartAuthContextCookieOptions } from '@/lib/stalwart/auth-context';

describe('Stalwart auth context cookie options', () => {
  it('keeps a persistent lifetime for remembered sessions', () => {
    expect(getStalwartAuthContextCookieOptions(true)).toHaveProperty('maxAge', 30 * 24 * 60 * 60);
  });

  it('uses a browser-session cookie otherwise', () => {
    expect(getStalwartAuthContextCookieOptions(false)).not.toHaveProperty('maxAge');
  });
});
