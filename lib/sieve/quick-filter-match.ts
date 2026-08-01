import type { Email, EmailAddress } from '@/lib/jmap/types';
import {
  selectedQuickFilterFields,
  type QuickFilterDraft,
  type QuickFilterField,
} from './quick-filter';

/**
 * Reproduces, for messages already in the mailbox, what the generated Sieve
 * rule will do to messages that arrive later.
 *
 * Sieve tests the raw header, so an address contributes both its display name
 * and its address - `header :contains "From" "Shop"` matches
 * `From: "Shop" <news@shop.com>`. The default comparator (`i;ascii-casemap`)
 * is case-insensitive.
 */
function formatAddressHeader(addresses: EmailAddress[] | undefined): string {
  return (addresses ?? [])
    .map((address) => (address.name ? `${address.name} <${address.email}>` : address.email))
    .join(', ');
}

function headerValue(email: Email, field: QuickFilterField): string {
  switch (field) {
    case 'from':
      return formatAddressHeader(email.from);
    case 'to':
      return formatAddressHeader(email.to);
    case 'subject':
      return email.subject ?? '';
  }
}

export function emailMatchesQuickFilter(email: Email, draft: QuickFilterDraft): boolean {
  const fields = selectedQuickFilterFields(draft);
  if (fields.length === 0) {
    return false;
  }
  // The dialog always builds an "all conditions" rule.
  return fields.every((field) => {
    const needle = draft.conditions[field].value.trim().toLowerCase();
    return needle.length > 0 && headerValue(email, field).toLowerCase().includes(needle);
  });
}

/**
 * Narrows the folder server-side before the exact test above runs. Stalwart's
 * index is tokenized, so this is a candidate set rather than the answer - it
 * can miss a substring that falls inside a word, which is why the rule itself
 * remains the thing that catches everything from here on.
 */
export function buildQuickFilterQuery(
  draft: QuickFilterDraft,
  mailboxId: string,
): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [{ inMailbox: mailboxId }];

  for (const field of selectedQuickFilterFields(draft)) {
    const value = draft.conditions[field].value.trim();
    switch (field) {
      case 'from':
        conditions.push({ from: value });
        break;
      case 'to':
        conditions.push({ to: value });
        break;
      case 'subject':
        conditions.push({ subject: value });
        break;
    }
  }

  if (conditions.length === 1) {
    return conditions[0];
  }
  return { operator: 'AND', conditions };
}
