import { describe, it, expect } from 'vitest';
import {
  buildQuickFilterDraftRule,
  buildQuickFilterRule,
  buildQuickFilterRuleName,
  createQuickFilterDraft,
  isQuickFilterDraftComplete,
  type QuickFilterDraft,
  type QuickFilterField,
} from '../quick-filter';
import type { Email } from '@/lib/jmap/types';

const LABELS: Record<QuickFilterField, string> = { from: 'From', to: 'To', subject: 'Subject' };
const label = (field: QuickFilterField) => LABELS[field];

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

describe('createQuickFilterDraft', () => {
  it('prefills every field from the message', () => {
    const draft = createQuickFilterDraft(makeEmail());
    expect(draft.conditions.from.value).toBe('news@shop.com');
    expect(draft.conditions.to.value).toBe('me@example.com');
    expect(draft.conditions.subject.value).toBe('Weekly deals');
  });

  it('checks the sender by default', () => {
    const draft = createQuickFilterDraft(makeEmail());
    expect(draft.conditions.from.enabled).toBe(true);
    expect(draft.conditions.to.enabled).toBe(false);
    expect(draft.conditions.subject.enabled).toBe(false);
  });

  it('falls back to the subject when the message has no sender', () => {
    const draft = createQuickFilterDraft(makeEmail({ from: undefined }));
    expect(draft.conditions.from.enabled).toBe(false);
    expect(draft.conditions.subject.enabled).toBe(true);
  });

  it('checks nothing when the message has neither sender nor subject', () => {
    const draft = createQuickFilterDraft(makeEmail({ from: undefined, subject: undefined }));
    expect(draft.conditions.from.enabled).toBe(false);
    expect(draft.conditions.subject.enabled).toBe(false);
    expect(isQuickFilterDraftComplete(draft)).toBe(false);
  });

  it('starts with no action selected', () => {
    const draft = createQuickFilterDraft(makeEmail());
    expect(Object.values(draft.actions).every((enabled) => !enabled)).toBe(true);
  });
});

describe('isQuickFilterDraftComplete', () => {
  const base = (): QuickFilterDraft => createQuickFilterDraft(makeEmail());

  it('requires at least one action', () => {
    expect(isQuickFilterDraftComplete(base())).toBe(false);
  });

  it('accepts a checked condition plus a valueless action', () => {
    const draft = base();
    draft.actions.mark_read = true;
    expect(isQuickFilterDraftComplete(draft)).toBe(true);
  });

  it('rejects a checked condition whose value is blank', () => {
    const draft = base();
    draft.conditions.from.value = '   ';
    draft.actions.mark_read = true;
    expect(isQuickFilterDraftComplete(draft)).toBe(false);
  });

  it('rejects move without a folder and accepts it once one is chosen', () => {
    const draft = base();
    draft.actions.move = true;
    expect(isQuickFilterDraftComplete(draft)).toBe(false);
    draft.mailboxPath = 'INBOX/Toilet';
    expect(isQuickFilterDraftComplete(draft)).toBe(true);
  });

  it('rejects add_label without a tag', () => {
    const draft = base();
    draft.actions.add_label = true;
    expect(isQuickFilterDraftComplete(draft)).toBe(false);
  });
});

describe('buildQuickFilterRule', () => {
  it('returns null for an incomplete draft', () => {
    expect(buildQuickFilterRule(createQuickFilterDraft(makeEmail()), label)).toBeNull();
  });

  it('builds a sender rule that marks mail as read', () => {
    const draft = createQuickFilterDraft(makeEmail());
    draft.actions.mark_read = true;

    const rule = buildQuickFilterRule(draft, label);

    expect(rule).not.toBeNull();
    expect(rule!.enabled).toBe(true);
    expect(rule!.matchType).toBe('all');
    expect(rule!.stopProcessing).toBe(false);
    expect(rule!.origin).toBeUndefined();
    expect(rule!.conditions).toEqual([
      { field: 'from', comparator: 'contains', value: 'news@shop.com' },
    ]);
    expect(rule!.actions).toEqual([{ type: 'mark_read' }]);
  });

  it('builds a subject rule that files into a folder', () => {
    const draft = createQuickFilterDraft(makeEmail({ subject: 'GOVNO' }));
    draft.conditions.from.enabled = false;
    draft.conditions.subject.enabled = true;
    draft.actions.move = true;
    draft.mailboxPath = 'INBOX/Toilet';

    const rule = buildQuickFilterRule(draft, label);

    expect(rule!.conditions).toEqual([
      { field: 'subject', comparator: 'contains', value: 'GOVNO' },
    ]);
    expect(rule!.actions).toEqual([{ type: 'move', value: 'INBOX/Toilet' }]);
  });

  it('trims condition values', () => {
    const draft = createQuickFilterDraft(makeEmail());
    draft.conditions.from.value = '  news@shop.com  ';
    draft.actions.star = true;

    expect(buildQuickFilterRule(draft, label)!.conditions[0].value).toBe('news@shop.com');
  });

  it('keeps unchecked conditions and unchecked actions out of the rule', () => {
    const draft = createQuickFilterDraft(makeEmail());
    draft.conditions.to.enabled = true;
    draft.actions.mark_read = true;
    draft.actions.star = true;

    const rule = buildQuickFilterRule(draft, label)!;

    expect(rule.conditions.map((c) => c.field)).toEqual(['from', 'to']);
    expect(rule.actions.map((a) => a.type)).toEqual(['mark_read', 'star']);
  });

  it('gives each rule a distinct id', () => {
    const draft = createQuickFilterDraft(makeEmail());
    draft.actions.mark_read = true;
    expect(buildQuickFilterRule(draft, label)!.id).not.toBe(
      buildQuickFilterRule(draft, label)!.id,
    );
  });
});

describe('buildQuickFilterRuleName', () => {
  it('names the rule after the checked conditions', () => {
    const draft = createQuickFilterDraft(makeEmail());
    expect(buildQuickFilterRuleName(draft, label)).toBe('From: news@shop.com');
  });

  it('joins several conditions', () => {
    const draft = createQuickFilterDraft(makeEmail({ subject: 'GOVNO' }));
    draft.conditions.subject.enabled = true;
    expect(buildQuickFilterRuleName(draft, label)).toBe('From: news@shop.com · Subject: GOVNO');
  });

  it('caps the name at the length the rule editor accepts', () => {
    const draft = createQuickFilterDraft(makeEmail({ subject: 'x'.repeat(400) }));
    draft.conditions.from.enabled = false;
    draft.conditions.subject.enabled = true;
    expect(buildQuickFilterRuleName(draft, label)).toHaveLength(200);
  });
});

describe('buildQuickFilterDraftRule', () => {
  it('hands an empty draft over without conditions or actions', () => {
    const draft = createQuickFilterDraft(makeEmail({ from: undefined, subject: undefined }));
    const rule = buildQuickFilterDraftRule(draft, label);

    expect(rule.conditions).toEqual([]);
    expect(rule.actions).toEqual([]);
    expect(rule.name).toBe('');
  });

  it('carries a partially filled draft over', () => {
    const draft = createQuickFilterDraft(makeEmail());
    const rule = buildQuickFilterDraftRule(draft, label);

    expect(rule.conditions).toHaveLength(1);
    expect(rule.actions).toEqual([]);
  });
});
