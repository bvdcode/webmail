import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoJMAPClient } from '@/lib/demo/demo-client';
import { createDemoMailboxes } from '@/lib/demo/fixtures/mailboxes';
import { DEFAULT_SEARCH_FILTERS } from '@/lib/jmap/search-utils';
import type { Email } from '@/lib/jmap/types';
import { useAuthStore } from '../auth-store';
import { useEmailStore } from '../email-store';
import { useSettingsStore } from '../settings-store';

const inbox = createDemoMailboxes()[0];

function message(id: string): Email {
  return {
    id, threadId: `thread-${id}`, mailboxIds: { [inbox.id]: true },
    keywords: {}, receivedAt: '2026-10-01T12:00:00Z', size: 100,
    hasAttachment: false, subject: id,
  };
}

function page(emails: Email[], total = emails.length) {
  return { emails, total, hasMore: total > emails.length };
}

describe('unread filter', () => {
  let client: DemoJMAPClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new DemoJMAPClient();
    vi.spyOn(client, 'markAsRead').mockResolvedValue();
    vi.spyOn(client, 'batchMarkAsRead').mockResolvedValue();
    vi.spyOn(client, 'getEmails').mockResolvedValue(page([]));
    vi.spyOn(client, 'advancedSearchEmails').mockResolvedValue(page([]));
    useAuthStore.setState({ client, activeAccountId: null });
    useSettingsStore.setState({ emailsPerPage: 3 });
    useEmailStore.setState(useEmailStore.getInitialState(), true);
    useEmailStore.setState({
      mailboxes: [inbox], selectedMailbox: inbox.id,
      fetchThreadEmailCounts: vi.fn().mockResolvedValue(undefined),
    });
  });

  function seedUnread() {
    useEmailStore.setState({
      emails: [message('a'), message('b')], totalEmails: 2,
      searchFilters: { ...DEFAULT_SEARCH_FILTERS, isUnread: true },
      searchMailboxId: inbox.id,
    });
  }

  function readMessages(action: 'batch' | 'thread'): Promise<void> {
    switch (action) {
      case 'batch':
        return useEmailStore.getState().batchMarkAsRead(client, true);
      case 'thread':
        return useEmailStore.getState().markThreadAsRead(client, 'thread-a');
    }
  }

  it('enables unread in the current folder without opening advanced search', async () => {
    await useEmailStore.getState().toggleUnreadFilter(client);
    expect(client.advancedSearchEmails).toHaveBeenCalledWith({
      operator: 'AND', conditions: [{ notKeyword: '$seen' }, { inMailbox: inbox.id }],
    }, undefined, 3, 0);
    expect(useEmailStore.getState().isAdvancedSearchOpen).toBe(false);
    expect(useEmailStore.getState().searchFilters.isUnread).toBe(true);
  });

  it('turns off without switching to a read-only filter', async () => {
    seedUnread();
    await useEmailStore.getState().toggleUnreadFilter(client);
    expect(useEmailStore.getState().searchFilters.isUnread).toBeNull();
    expect(client.getEmails).toHaveBeenCalled();
    expect(client.advancedSearchEmails).not.toHaveBeenCalled();
  });

  it('preserves other search criteria and their explicit folder scope', async () => {
    useEmailStore.setState({
      searchQuery: 'invoice', searchMailboxId: 'archive',
      searchFilters: { ...DEFAULT_SEARCH_FILTERS, from: 'billing@example.test' },
    });
    await useEmailStore.getState().toggleUnreadFilter(client);
    await useEmailStore.getState().toggleUnreadFilter(client);
    expect(useEmailStore.getState().searchMailboxId).toBe('archive');
    expect(useEmailStore.getState().searchQuery).toBe('invoice');
    expect(useEmailStore.getState().searchFilters.from).toBe('billing@example.test');
    expect(client.advancedSearchEmails).toHaveBeenLastCalledWith({
      operator: 'AND', conditions: [
        { text: 'invoice*' }, { from: 'billing@example.test' }, { inMailbox: 'archive' },
      ],
    }, undefined, 3, 0);
  });

  it('does not filter scheduled messages', async () => {
    useEmailStore.setState({ isScheduledView: true });
    await useEmailStore.getState().toggleUnreadFilter(client);
    expect(client.advancedSearchEmails).not.toHaveBeenCalled();
  });

  it('filters real demo data and keeps a read message until the next filter session', async () => {
    const demo = new DemoJMAPClient();
    useAuthStore.setState({ client: demo });
    await useEmailStore.getState().toggleUnreadFilter(demo);
    const initial = useEmailStore.getState().emails;
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every(email => email.mailboxIds[inbox.id] && !email.keywords.$seen)).toBe(true);
    const firstId = initial[0].id;
    await useEmailStore.getState().markAsRead(demo, firstId, true);
    await useEmailStore.getState().refreshCurrentMailbox(demo);
    expect(useEmailStore.getState().emails.some(email => email.id === firstId)).toBe(true);
    await useEmailStore.getState().toggleUnreadFilter(demo);
    await useEmailStore.getState().toggleUnreadFilter(demo);
    expect(useEmailStore.getState().emails.some(email => email.id === firstId)).toBe(false);
  });

  it('keeps a just-read message in its original position after push refresh', async () => {
    seedUnread();
    await useEmailStore.getState().markAsRead(client, 'a', true);
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('b')]));
    await useEmailStore.getState().refreshCurrentMailbox(client);
    const state = useEmailStore.getState();
    expect(state.emails.map(email => email.id)).toEqual(['a', 'b']);
    expect(state.emails[0].keywords.$seen).toBe(true);
    expect(state.totalEmails).toBe(2);
    expect(state.hasMoreEmails).toBe(false);
  });

  it('retains the row even when push arrives before the read request finishes', async () => {
    seedUnread();
    let finishRead: () => void = () => {};
    vi.mocked(client.markAsRead).mockImplementation(() => new Promise<void>(resolve => { finishRead = resolve; }));
    const read = useEmailStore.getState().markAsRead(client, 'a', true);
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('b')]));
    await useEmailStore.getState().refreshCurrentMailbox(client);
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['a', 'b']);
    finishRead();
    await read;
    expect(useEmailStore.getState().emails[0].keywords.$seen).toBe(true);
  });

  it('removes provisional retention when marking read fails', async () => {
    seedUnread();
    vi.mocked(client.markAsRead).mockRejectedValue(new Error('read failed'));
    await expect(useEmailStore.getState().markAsRead(client, 'a', true)).rejects.toThrow('read failed');
    expect(useEmailStore.getState().retainedInViewIds.size).toBe(0);
  });

  it.each(['batch', 'thread'] as const)('keeps messages read through a %s action', async action => {
    seedUnread();
    useEmailStore.setState({ selectedEmailIds: new Set(['a']) });
    await readMessages(action);
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('b')]));
    await useEmailStore.getState().refreshCurrentMailbox(client);
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['a', 'b']);
  });

  it.each(['batch', 'thread'] as const)('retains rows during a pending %s read request', async action => {
    seedUnread();
    useEmailStore.setState({ selectedEmailIds: new Set(['a']) });
    let finishRead: () => void = () => {};
    vi.mocked(client.batchMarkAsRead).mockImplementation(() => new Promise<void>(resolve => { finishRead = resolve; }));
    const read = readMessages(action);
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('b')]));
    await useEmailStore.getState().refreshCurrentMailbox(client);
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['a', 'b']);
    finishRead();
    await read;
    expect(useEmailStore.getState().emails[0].keywords.$seen).toBe(true);
  });

  it.each(['batch', 'thread'] as const)('rolls back provisional retention when a %s read fails', async action => {
    seedUnread();
    useEmailStore.setState({ selectedEmailIds: new Set(['a']) });
    vi.mocked(client.batchMarkAsRead).mockRejectedValue(new Error('read failed'));
    await readMessages(action);
    expect(useEmailStore.getState().retainedInViewIds.size).toBe(0);
  });

  it('does not resurrect a retained message removed from the local list', async () => {
    seedUnread();
    await useEmailStore.getState().markAsRead(client, 'a', true);
    useEmailStore.setState({ emails: [message('b')] });
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('b')]));
    await useEmailStore.getState().refreshCurrentMailbox(client);
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['b']);
  });

  it('paginates using server matches, not retained read rows', async () => {
    seedUnread();
    await useEmailStore.getState().markAsRead(client, 'a', true);
    useEmailStore.setState({ hasMoreEmails: true });
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('c')], 2));
    await useEmailStore.getState().loadMoreEmails(client);
    expect(client.advancedSearchEmails).toHaveBeenLastCalledWith(expect.any(Object), undefined, 3, 1);
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['a', 'b', 'c']);
    expect(useEmailStore.getState().totalEmails).toBe(3);
  });

  it('ignores a stale refresh after the filter was changed', async () => {
    seedUnread();
    let finishRefresh: (result: ReturnType<typeof page>) => void = () => {};
    vi.mocked(client.advancedSearchEmails).mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
    const refresh = useEmailStore.getState().refreshCurrentMailbox(client);
    useEmailStore.getState().setSearchFilters({ isUnread: null });
    useEmailStore.setState({ emails: [message('new-view')] });
    finishRefresh(page([message('b')]));
    await refresh;
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['new-view']);
  });

  it('a fresh search drops retained rows and shows only currently unread messages', async () => {
    seedUnread();
    await useEmailStore.getState().markAsRead(client, 'a', true);
    vi.mocked(client.advancedSearchEmails).mockResolvedValue(page([message('b')]));
    await useEmailStore.getState().advancedSearch(client);
    expect(useEmailStore.getState().retainedInViewIds.size).toBe(0);
    expect(useEmailStore.getState().emails.map(email => email.id)).toEqual(['b']);
  });

  it('clears retained rows when changing folders or filter criteria', async () => {
    seedUnread();
    await useEmailStore.getState().markAsRead(client, 'a', true);
    useEmailStore.getState().selectMailbox('archive');
    expect(useEmailStore.getState().retainedInViewIds.size).toBe(0);
    useEmailStore.setState({ retainedInViewIds: new Set(['a']) });
    useEmailStore.getState().setSearchFilters({ subject: 'other' });
    expect(useEmailStore.getState().retainedInViewIds.size).toBe(0);
  });
});
