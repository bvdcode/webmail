import { describe, it, expect } from 'vitest';
import { buildSieveMailboxOptions } from '@/lib/sieve/mailbox-paths';
import type { Mailbox } from '@/lib/jmap/types';

const makeMailbox = (overrides: Partial<Mailbox> = {}): Mailbox => ({
  id: 'mb-1',
  name: 'Inbox',
  sortOrder: 0,
  totalEmails: 0,
  unreadEmails: 0,
  totalThreads: 0,
  unreadThreads: 0,
  myRights: {
    mayReadItems: true,
    mayAddItems: true,
    mayRemoveItems: true,
    maySetSeen: true,
    maySetKeywords: true,
    mayCreateChild: true,
    mayRename: true,
    mayDelete: true,
    maySubmit: true,
  },
  isSubscribed: true,
  ...overrides,
});

describe('mailbox path building for sieve fileinto', () => {
  it('should produce correct path for a root mailbox', () => {
    const { pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
    ]);
    expect(pathMap.get('inbox')).toBe('INBOX');
  });

  it('should produce correct path for a single-level subfolder', () => {
    const { pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
      makeMailbox({ id: 'sub1', name: 'Projects', parentId: 'inbox' }),
    ]);
    expect(pathMap.get('sub1')).toBe('INBOX/Projects');
  });

  it('should produce correct path for deeply nested subfolders', () => {
    const { pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
      makeMailbox({ id: 'sub1', name: 'Test', parentId: 'inbox' }),
      makeMailbox({ id: 'sub2', name: 'Test2', parentId: 'sub1' }),
    ]);
    expect(pathMap.get('sub2')).toBe('INBOX/Test/Test2');
  });

  it('should handle multiple root-level folders', () => {
    const { pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
      makeMailbox({ id: 'archive', name: 'Archive', role: 'archive' }),
      makeMailbox({ id: 'sub1', name: 'Work', parentId: 'archive' }),
    ]);
    expect(pathMap.get('inbox')).toBe('INBOX');
    expect(pathMap.get('archive')).toBe('Archive');
    expect(pathMap.get('sub1')).toBe('Archive/Work');
  });

  it('should produce paths for all offered mailboxes', () => {
    const { mailboxes, pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
      makeMailbox({ id: 'sub1', name: 'Projects', parentId: 'inbox' }),
      makeMailbox({ id: 'sub2', name: 'Active', parentId: 'sub1' }),
    ]);

    for (const node of mailboxes) {
      expect(pathMap.has(node.id)).toBe(true);
    }

    expect(pathMap.get('inbox')).toBe('INBOX');
    expect(pathMap.get('sub1')).toBe('INBOX/Projects');
    expect(pathMap.get('sub2')).toBe('INBOX/Projects/Active');
  });

  it('uses canonical INBOX even when JMAP returns a localized inbox name', () => {
    // Stalwart returns localized display names for the inbox based on the
    // user's locale (e.g. "Entrada" for pt-BR). Sieve fileinto must still
    // target the IMAP-canonical "INBOX" so the message is filed correctly.
    const { pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Entrada', role: 'inbox' }),
      makeMailbox({ id: 'host', name: 'Host', parentId: 'inbox' }),
      makeMailbox({ id: 'eveo', name: 'EVEO', parentId: 'host' }),
    ]);
    expect(pathMap.get('inbox')).toBe('INBOX');
    expect(pathMap.get('host')).toBe('INBOX/Host');
    expect(pathMap.get('eveo')).toBe('INBOX/Host/EVEO');
  });

  it('should preserve depth info for option indentation', () => {
    const { mailboxes } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
      makeMailbox({ id: 'sub1', name: 'Projects', parentId: 'inbox' }),
      makeMailbox({ id: 'sub2', name: 'Alpha', parentId: 'sub1' }),
    ]);
    const byId = Object.fromEntries(mailboxes.map((n) => [n.id, n]));

    expect(byId['inbox'].depth).toBe(0);
    expect(byId['sub1'].depth).toBe(1);
    expect(byId['sub2'].depth).toBe(2);
  });

  it('drops shared mailboxes, which the account script cannot file into', () => {
    const { mailboxes, pathMap } = buildSieveMailboxOptions([
      makeMailbox({ id: 'inbox', name: 'Inbox', role: 'inbox' }),
      makeMailbox({ id: 'shared-1', name: 'Team', isShared: true }),
    ]);

    expect(pathMap.has('shared-1')).toBe(false);
    expect(mailboxes.some((mb) => mb.id === 'shared-1')).toBe(false);
  });
});
