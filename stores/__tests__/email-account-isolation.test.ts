import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JMAPClient } from '@/lib/jmap/client';
import type { Email, Mailbox } from '@/lib/jmap/types';
import { useAuthStore } from '../auth-store';
import { resolveEmailActionContext, useEmailStore } from '../email-store';
import { DemoJMAPClient } from '@/lib/demo/demo-client';

function makeClient(host: string) {
  const client = new JMAPClient(host, 'user@example.com', 'test');
  vi.spyOn(client, 'getAccountId').mockReturnValue('same-owner');
  vi.spyOn(client, 'batchMarkAsRead').mockResolvedValue(undefined);
  vi.spyOn(client, 'markAsRead').mockResolvedValue(undefined);
  vi.spyOn(client, 'moveEmail').mockResolvedValue(undefined);
  vi.spyOn(client, 'batchMoveEmails').mockResolvedValue(undefined);
  return client;
}

function message(id: string, login: string): Email {
  return { id, threadId: id, sourceClientAccountId: login, sourceAccountId: 'same-owner',
    mailboxIds: { inbox: true }, keywords: {}, size: 10, hasAttachment: false, receivedAt: '2026-11-01T12:00:00Z' };
}

describe('mail account isolation', () => {
  let first: JMAPClient;
  let second: JMAPClient;
  let inbox: Mailbox;

  beforeEach(async () => {
    vi.restoreAllMocks();
    first = makeClient('https://first.example');
    second = makeClient('https://second.example');
    const demo = new DemoJMAPClient();
    inbox = { ...(await demo.getMailboxes())[0], id: 'inbox', role: 'inbox', isShared: false };
    useAuthStore.setState({ client: first, activeAccountId: 'first',
      getClientForAccount: id => id === 'first' ? first : id === 'second' ? second : undefined });
    useEmailStore.setState(useEmailStore.getInitialState(), true);
    useEmailStore.setState({ isUnifiedView: true, mailboxes: [inbox],
      emails: [message('one', 'first'), message('two', 'second')],
      accountMailboxes: { second: [{ ...inbox, id: 'second-inbox' }], 'same-owner': [{ ...inbox, id: 'wrong-server-folder' }] },
    });
  });

  it('groups writes by login as well as the server account id', async () => {
    useEmailStore.setState({ selectedEmailIds: new Set(['one', 'two']) });
    await useEmailStore.getState().batchMarkAsRead(first, true);
    expect(first.batchMarkAsRead).toHaveBeenCalledWith(['one'], true, 'same-owner');
    expect(second.batchMarkAsRead).toHaveBeenCalledWith(['two'], true, 'same-owner');
  });

  it('uses the owning login folders, never another server cache with the same account id', () => {
    const context = resolveEmailActionContext(message('two', 'second'), first);
    expect(context.client).toBe(second);
    expect(context.mailboxes.map(mailbox => mailbox.id)).toEqual(['second-inbox']);
  });

  it('does not mutate the active account when the source login is disconnected', async () => {
    useAuthStore.setState({ getClientForAccount: id => id === 'first' ? first : undefined });
    await expect(useEmailStore.getState().markAsRead(first, 'two', true)).rejects.toThrow('Account is not connected');
    expect(first.markAsRead).not.toHaveBeenCalled();
    expect(second.markAsRead).not.toHaveBeenCalled();
  });

  it('honours a stamped login outside the unified view even without a server account override', () => {
    useEmailStore.setState({ isUnifiedView: false });
    const context = resolveEmailActionContext({ sourceClientAccountId: 'second' }, first);
    expect(context.client).toBe(second);
    expect(context.mailboxes.map(mailbox => mailbox.id)).toEqual(['second-inbox']);
    useAuthStore.setState({ getClientForAccount: () => undefined });
    expect(() => resolveEmailActionContext({ sourceClientAccountId: 'second' }, first)).toThrow('Account is not connected');
  });

  it('does not switch to the active account for a disconnected browsed folder', async () => {
    useEmailStore.setState({ isUnifiedView: false, viewingAccountId: 'offline', selectedMailbox: 'inbox',
      emails: [{ ...message('one', 'first'), sourceClientAccountId: undefined, sourceAccountId: undefined }] });
    await expect(useEmailStore.getState().moveToMailbox(first, 'one', 'archive')).rejects.toThrow('Account is not connected');
    expect(first.moveEmail).not.toHaveBeenCalled();
  });

  it('takes an expanded message account from the thread instead of the active login', async () => {
    useEmailStore.setState({ emails: [], selectedEmailIds: new Set(['two']), expandedThreadIds: new Set(['thread']),
      threadEmailsCache: new Map([['thread', [message('two', 'second')]]]) });
    await useEmailStore.getState().batchMarkAsRead(first, true);
    expect(first.batchMarkAsRead).not.toHaveBeenCalled();
    expect(second.batchMarkAsRead).toHaveBeenCalledWith(['two'], true, 'same-owner');
  });

  it('refuses an ambiguous message id shared by two logins', async () => {
    useEmailStore.setState({ emails: [message('same-id', 'first'), message('same-id', 'second')], selectedEmailIds: new Set(['same-id']) });
    await useEmailStore.getState().batchMarkAsRead(first, true);
    expect(first.batchMarkAsRead).not.toHaveBeenCalled();
    expect(second.batchMarkAsRead).not.toHaveBeenCalled();
    expect(useEmailStore.getState().selectedEmailIds.has('same-id')).toBe(true);
    expect(useEmailStore.getState().error).toBe('Message account cannot be determined');
  });

  it('also refuses single-message writes when a bare id identifies different owners', async () => {
    useEmailStore.setState({ emails: [message('same-id', 'first'), message('same-id', 'second')] });
    await expect(useEmailStore.getState().markAsRead(first, 'same-id', true))
      .rejects.toThrow('Message account cannot be determined');
    await expect(useEmailStore.getState().moveToMailbox(first, 'same-id', 'inbox'))
      .rejects.toThrow('Message account cannot be determined');
    expect(first.markAsRead).not.toHaveBeenCalled();
    expect(second.markAsRead).not.toHaveBeenCalled();
    expect(first.moveEmail).not.toHaveBeenCalled();
    expect(second.moveEmail).not.toHaveBeenCalled();
  });

  it('refuses to apply one move destination to messages from different logins', async () => {
    useEmailStore.setState({ selectedEmailIds: new Set(['one', 'two']) });
    await useEmailStore.getState().batchMoveToMailbox(first, 'inbox');
    expect(first.batchMoveEmails).not.toHaveBeenCalled();
    expect(second.batchMoveEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().selectedEmailIds.size).toBe(2);
  });

  it('resolves a batch move destination only within the source login', async () => {
    useEmailStore.setState({ emails: [message('two', 'second'), message('three', 'second')] });
    await expect(useEmailStore.getState().moveEmailsToMailbox(first, ['two', 'three'], 'inbox'))
      .rejects.toThrow('Destination mailbox does not belong to the message account');
    expect(first.batchMoveEmails).not.toHaveBeenCalled();
    expect(second.batchMoveEmails).not.toHaveBeenCalled();
    await useEmailStore.getState().moveEmailsToMailbox(first, ['two', 'three'], 'second-inbox');
    expect(second.batchMoveEmails).toHaveBeenCalledWith(['two', 'three'], 'second-inbox', 'same-owner');
  });
});
