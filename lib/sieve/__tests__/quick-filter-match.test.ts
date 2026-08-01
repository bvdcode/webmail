import { describe, it, expect } from 'vitest';
import { buildQuickFilterQuery, emailMatchesQuickFilter } from '../quick-filter-match';
import { createQuickFilterDraft, type QuickFilterDraft } from '../quick-filter';
import type { Email } from '@/lib/jmap/types';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    mailboxIds: { inbox: true },
    keywords: {},
    size: 1024,
    receivedAt: '2026-01-01T00:00:00Z',
    hasAttachment: false,
    from: [{ name: 'Shop', email: 'news@shop.com' }],
    to: [{ email: 'me@example.com' }],
    subject: 'Weekly deals',
    ...overrides,
  };
}

function draftWith(overrides: (draft: QuickFilterDraft) => void): QuickFilterDraft {
  const draft = createQuickFilterDraft(makeEmail());
  overrides(draft);
  return draft;
}

describe('emailMatchesQuickFilter', () => {
  it('matches the sender the draft was seeded from', () => {
    expect(emailMatchesQuickFilter(makeEmail(), createQuickFilterDraft(makeEmail()))).toBe(true);
  });

  it('matches on a substring of the address, so a domain rule works', () => {
    const draft = draftWith((d) => {
      d.conditions.from.value = '@shop.com';
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(true);
  });

  it('matches the display name, which Sieve also sees in the raw header', () => {
    const draft = draftWith((d) => {
      d.conditions.from.value = 'Shop';
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(true);
  });

  it('ignores case, like the default Sieve comparator', () => {
    const draft = draftWith((d) => {
      d.conditions.from.value = 'NEWS@SHOP.COM';
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(true);
  });

  it('rejects a different sender', () => {
    const draft = draftWith((d) => {
      d.conditions.from.value = 'news@other.com';
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(false);
  });

  it('requires every checked condition to hold', () => {
    const draft = draftWith((d) => {
      d.conditions.subject.enabled = true;
      d.conditions.subject.value = 'Invoice';
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(false);

    draft.conditions.subject.value = 'deals';
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(true);
  });

  it('ignores unchecked conditions', () => {
    const draft = draftWith((d) => {
      d.conditions.to.value = 'nobody@nowhere.test';
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(true);
  });

  it('never matches when nothing is checked', () => {
    const draft = draftWith((d) => {
      d.conditions.from.enabled = false;
    });
    expect(emailMatchesQuickFilter(makeEmail(), draft)).toBe(false);
  });

  it('handles a message with no sender or subject', () => {
    const draft = draftWith((d) => {
      d.conditions.from.value = 'shop';
    });
    expect(emailMatchesQuickFilter(makeEmail({ from: undefined }), draft)).toBe(false);
  });

  it('matches any of several recipients', () => {
    const draft = draftWith((d) => {
      d.conditions.from.enabled = false;
      d.conditions.to.enabled = true;
      d.conditions.to.value = 'team@example.com';
    });
    const email = makeEmail({
      to: [{ email: 'me@example.com' }, { name: 'Team', email: 'team@example.com' }],
    });
    expect(emailMatchesQuickFilter(email, draft)).toBe(true);
  });
});

describe('buildQuickFilterQuery', () => {
  it('scopes to the folder when no condition is checked', () => {
    const draft = draftWith((d) => {
      d.conditions.from.enabled = false;
    });
    expect(buildQuickFilterQuery(draft, 'mb-1')).toEqual({ inMailbox: 'mb-1' });
  });

  it('ANDs the folder with each checked condition', () => {
    const draft = draftWith((d) => {
      d.conditions.subject.enabled = true;
      d.conditions.subject.value = 'deals';
    });
    expect(buildQuickFilterQuery(draft, 'mb-1')).toEqual({
      operator: 'AND',
      conditions: [
        { inMailbox: 'mb-1' },
        { from: 'news@shop.com' },
        { subject: 'deals' },
      ],
    });
  });

  it('trims the value it sends to the server', () => {
    const draft = draftWith((d) => {
      d.conditions.from.value = '  news@shop.com  ';
    });
    expect(buildQuickFilterQuery(draft, 'mb-1')).toEqual({
      operator: 'AND',
      conditions: [{ inMailbox: 'mb-1' }, { from: 'news@shop.com' }],
    });
  });
});
