import { describe, expect, it } from 'vitest';
import { getStalwartAuthContextCookieOptions } from '@/lib/stalwart/auth-context';
import { getCookieOptions } from '@/lib/oauth/cookie-config';

describe('Stalwart auth context cookie', () => {
  it('survives browser restarts only for persistent sign-ins', () => {
    const persistent = getStalwartAuthContextCookieOptions(true);
    const sessionOnly = getStalwartAuthContextCookieOptions(false);

    expect(persistent).toHaveProperty('maxAge', getCookieOptions().maxAge);
    expect('maxAge' in sessionOnly).toBe(false);
  });
});
