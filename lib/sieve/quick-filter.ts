import type { Email } from '@/lib/jmap/types';
import type { FilterAction, FilterCondition, FilterRule } from '@/lib/jmap/sieve-types';
import { generateUUID } from '@/lib/utils';

/**
 * The reduced vocabulary of the one-click "create filter" dialog reachable from
 * a message. It covers the two everyday cases - act on a sender, act on a
 * subject - and hands anything richer over to the full rule editor.
 */
export const QUICK_FILTER_FIELDS = ['from', 'to', 'subject'] as const;
export type QuickFilterField = (typeof QUICK_FILTER_FIELDS)[number];

export const QUICK_FILTER_ACTIONS = ['mark_read', 'star', 'move', 'add_label'] as const;
export type QuickFilterActionType = (typeof QUICK_FILTER_ACTIONS)[number];

export interface QuickFilterConditionDraft {
  enabled: boolean;
  value: string;
}

export interface QuickFilterDraft {
  conditions: Record<QuickFilterField, QuickFilterConditionDraft>;
  actions: Record<QuickFilterActionType, boolean>;
  /** Sieve `fileinto` path, set when the `move` action is selected. */
  mailboxPath: string;
  /** The same folder as a JMAP id, for applying the rule to existing mail. */
  mailboxId: string;
  /** Keyword id, set when the `add_label` action is selected. */
  labelId: string;
}

const RULE_NAME_MAX_LENGTH = 200;

function firstAddress(addresses: Email['from']): string {
  return addresses?.[0]?.email?.trim() ?? '';
}

/**
 * Seeds the dialog from the message the user right-clicked. The sender is the
 * overwhelmingly common target, so it starts checked whenever the message has
 * one; otherwise the subject takes over.
 */
export function createQuickFilterDraft(email: Email): QuickFilterDraft {
  const from = firstAddress(email.from);
  const to = firstAddress(email.to);
  const subject = email.subject?.trim() ?? '';

  return {
    conditions: {
      from: { enabled: Boolean(from), value: from },
      to: { enabled: false, value: to },
      subject: { enabled: !from && Boolean(subject), value: subject },
    },
    actions: { mark_read: false, star: false, move: false, add_label: false },
    mailboxPath: '',
    mailboxId: '',
    labelId: '',
  };
}

export function selectedQuickFilterFields(draft: QuickFilterDraft): QuickFilterField[] {
  return QUICK_FILTER_FIELDS.filter(
    (field) => draft.conditions[field].enabled && draft.conditions[field].value.trim().length > 0,
  );
}

function actionValue(draft: QuickFilterDraft, action: QuickFilterActionType): string {
  switch (action) {
    case 'move':
      return draft.mailboxPath.trim();
    case 'add_label':
      return draft.labelId.trim();
    case 'mark_read':
    case 'star':
      return '';
  }
}

export function selectedQuickFilterActions(draft: QuickFilterDraft): QuickFilterActionType[] {
  return QUICK_FILTER_ACTIONS.filter(
    (action) => draft.actions[action] && (
      action === 'mark_read' || action === 'star' || actionValue(draft, action).length > 0
    ),
  );
}

export function isQuickFilterDraftComplete(draft: QuickFilterDraft): boolean {
  return selectedQuickFilterFields(draft).length > 0 && selectedQuickFilterActions(draft).length > 0;
}

/**
 * Names the rule after what it matches, e.g. `From: news@shop.com`, so the rule
 * is recognisable in Settings without asking for a name up front.
 */
export function buildQuickFilterRuleName(
  draft: QuickFilterDraft,
  fieldLabel: (field: QuickFilterField) => string,
): string {
  const name = selectedQuickFilterFields(draft)
    .map((field) => `${fieldLabel(field)}: ${draft.conditions[field].value.trim()}`)
    .join(' · ');
  return name.slice(0, RULE_NAME_MAX_LENGTH);
}

/**
 * Materialises whatever the draft currently holds. Conditions and actions may
 * come out empty - the full rule editor fills those gaps with its own defaults
 * when the user escalates a half-finished draft to it.
 */
export function buildQuickFilterDraftRule(
  draft: QuickFilterDraft,
  fieldLabel: (field: QuickFilterField) => string,
): FilterRule {
  const conditions: FilterCondition[] = selectedQuickFilterFields(draft).map((field) => ({
    field,
    comparator: 'contains',
    value: draft.conditions[field].value.trim(),
  }));

  const actions: FilterAction[] = selectedQuickFilterActions(draft).map((action) => {
    switch (action) {
      case 'mark_read':
        return { type: 'mark_read' };
      case 'star':
        return { type: 'star' };
      case 'move':
        return { type: 'move', value: actionValue(draft, action) };
      case 'add_label':
        return { type: 'add_label', value: actionValue(draft, action) };
    }
  });

  return {
    id: generateUUID(),
    name: buildQuickFilterRuleName(draft, fieldLabel),
    enabled: true,
    matchType: 'all',
    conditions,
    actions,
    stopProcessing: false,
  };
}

/**
 * Materialises the draft as a persistable Sieve rule. Returns `null` while the
 * draft is incomplete so a rule that matches nothing, or does nothing, can
 * never reach the server.
 */
export function buildQuickFilterRule(
  draft: QuickFilterDraft,
  fieldLabel: (field: QuickFilterField) => string,
): FilterRule | null {
  if (!isQuickFilterDraftComplete(draft)) {
    return null;
  }
  return buildQuickFilterDraftRule(draft, fieldLabel);
}
