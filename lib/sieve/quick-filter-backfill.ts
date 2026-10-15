import type { IJMAPClient } from '@/lib/jmap/client-interface';
import { KEYWORD_PREFIX } from '@/lib/thread-utils';
import { selectedQuickFilterActions, type QuickFilterDraft } from './quick-filter';
import { buildQuickFilterQuery, emailMatchesQuickFilter } from './quick-filter-match';

/** Messages fetched per query round trip. */
const PAGE_SIZE = 100;
/**
 * Ceiling on how much of the folder one backfill walks. A rule is meant to be
 * cheap and immediate; sweeping an unbounded archive is not. Anything past
 * this stays untouched, and `reachedLimit` says so.
 */
const MAX_SCANNED = 2000;

export interface QuickFilterBackfillResult {
  /** Messages the rule's conditions actually matched. */
  matched: number;
  /** Messages examined, before the exact condition test. */
  scanned: number;
  /** True when the scan stopped at MAX_SCANNED with more left in the folder. */
  reachedLimit: boolean;
}

/**
 * Applies a freshly created quick filter to the mail already sitting in a
 * folder. Sieve only ever runs on delivery, so without this the rule appears
 * to do nothing until the next message arrives.
 */
export async function backfillQuickFilter(
  client: IJMAPClient,
  draft: QuickFilterDraft,
  mailboxId: string,
): Promise<QuickFilterBackfillResult> {
  const actions = selectedQuickFilterActions(draft);
  if (actions.length === 0) {
    return { matched: 0, scanned: 0, reachedLimit: false };
  }

  const query = buildQuickFilterQuery(draft, mailboxId);
  const matchedIds: string[] = [];
  let scanned = 0;
  let position = 0;
  let reachedLimit = false;

  for (;;) {
    const page = await client.advancedSearchEmails(query, undefined, PAGE_SIZE, position);
    scanned += page.emails.length;

    for (const email of page.emails) {
      if (emailMatchesQuickFilter(email, draft)) {
        matchedIds.push(email.id);
      }
    }

    if (!page.hasMore || page.emails.length === 0) {
      break;
    }
    if (scanned >= MAX_SCANNED) {
      reachedLimit = true;
      break;
    }
    position += page.emails.length;
  }

  if (matchedIds.length > 0) {
    // Flags first: moving the messages out of this folder does not change
    // their ids, but doing the cheap patches while they are still here keeps
    // the order of effects the same as the Sieve rule's.
    if (draft.actions.mark_read) {
      await client.batchMarkAsRead(matchedIds, true);
    }
    if (draft.actions.star) {
      await client.batchUpdateKeywords(matchedIds, { $flagged: true });
    }
    if (draft.actions.add_label && draft.labelId.trim()) {
      await client.batchUpdateKeywords(matchedIds, {
        [`${KEYWORD_PREFIX}${draft.labelId.trim()}`]: true,
      });
    }
    if (draft.actions.move && draft.mailboxId) {
      await client.batchMoveEmails(matchedIds, draft.mailboxId);
    }
  }

  return { matched: matchedIds.length, scanned, reachedLimit };
}
