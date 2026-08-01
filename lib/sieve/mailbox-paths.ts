import type { Mailbox } from '@/lib/jmap/types';
import { buildMailboxTree, flattenMailboxTree, type MailboxNode } from '@/lib/utils';

export interface SieveMailboxOptions {
  /** Own mailboxes in tree order, each carrying its `depth` for indentation. */
  mailboxes: MailboxNode[];
  /** Mailbox id to its Sieve `fileinto` path, e.g. `INBOX/Receipts`. */
  pathMap: Map<string, string>;
}

/**
 * Folder targets offered to the Sieve rule editors.
 *
 * `fileinto` addresses a folder by its IMAP path, so the inbox is always the
 * canonical `INBOX` rather than the localized JMAP display name (e.g. "Entrada"
 * in pt-BR). Shared mailboxes belong to other accounts and are not reachable
 * from the account's own script, so they are dropped.
 */
export function buildSieveMailboxOptions(mailboxes: Mailbox[]): SieveMailboxOptions {
  const tree = buildMailboxTree(mailboxes.filter((mailbox) => !mailbox.isShared));
  const pathMap = new Map<string, string>();

  const collectPaths = (nodes: MailboxNode[], parentPath = '') => {
    for (const node of nodes) {
      const segment = node.role === 'inbox' ? 'INBOX' : node.name;
      const fullPath = parentPath ? `${parentPath}/${segment}` : segment;
      pathMap.set(node.id, fullPath);
      if (node.children.length > 0) {
        collectPaths(node.children, fullPath);
      }
    }
  };
  collectPaths(tree);

  return { mailboxes: flattenMailboxTree(tree), pathMap };
}
