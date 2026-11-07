import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoJMAPClient } from '@/lib/demo/demo-client';
import { JMAPClient } from '@/lib/jmap/client';
import { createDemoMailboxes } from '@/lib/demo/fixtures/mailboxes';
import type { Email } from '@/lib/jmap/types';
import { useAuthStore } from '../auth-store';
import { useEmailStore } from '../email-store';
import { useSettingsStore } from '../settings-store';

const inbox = createDemoMailboxes()[0];
const email: Email = {
  id: 'message', threadId: 'thread', mailboxIds: { [inbox.id]: true },
  keywords: {}, size: 100, hasAttachment: false, receivedAt: '2026-11-01T12:00:00Z',
};

function makeLoginClient() {
  const demo = new DemoJMAPClient();
  const login = new JMAPClient('https://mail.example.com', 'user@example.com', 'test');
  vi.spyOn(login, 'getAccountId').mockReturnValue(demo.getAccountId());
  vi.spyOn(login, 'createMailbox').mockImplementation((...args) => demo.createMailbox(...args));
  return login;
}

describe('missing archive confirmation', () => {
  let client: DemoJMAPClient;

  beforeEach(async () => {
    vi.restoreAllMocks();
    client = new DemoJMAPClient();
    await client.deleteMailbox('demo-mailbox-archive');
    useAuthStore.setState({ client, activeAccountId: null, getClientForAccount: () => undefined });
    useSettingsStore.setState({ archiveMode: 'single' });
    useEmailStore.setState(useEmailStore.getInitialState(), true);
    useEmailStore.setState({
      mailboxes: [inbox], selectedMailbox: inbox.id, emails: [email],
      selectedEmailIds: new Set([email.id]),
      refreshCurrentMailbox: vi.fn().mockResolvedValue(undefined),
      fetchMailboxes: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(client, 'createMailbox');
    vi.spyOn(client, 'batchArchiveEmails').mockResolvedValue(undefined);
  });

  it('does not create or move anything when the user declines', async () => {
    const request = vi.fn().mockResolvedValue(null);
    await useEmailStore.getState().batchArchive(client, request);
    expect(request).toHaveBeenCalledOnce();
    expect(client.createMailbox).not.toHaveBeenCalled();
    expect(client.batchArchiveEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails).toEqual([email]);
  });

  it('creates an archive role atomically and continues the requested archive', async () => {
    await useEmailStore.getState().batchArchive(client, async () => '  Архив  ');
    expect(client.createMailbox).toHaveBeenCalledWith('Архив', undefined, undefined, 'archive');
    const archive = useEmailStore.getState().mailboxes.find(mailbox => mailbox.role === 'archive');
    expect(archive?.name).toBe('Архив');
    expect(client.batchArchiveEmails).toHaveBeenCalledWith(
      [{ id: email.id, receivedAt: email.receivedAt }], archive?.id, 'single', [inbox], undefined,
    );
    expect(useEmailStore.getState().emails).toEqual([]);
  });

  it('reuses an existing localized archive without asking or creating another folder', async () => {
    const archive = { ...inbox, id: 'archive', name: 'Архив', role: 'archive' };
    useEmailStore.setState({ mailboxes: [inbox, archive] });
    const request = vi.fn().mockResolvedValue('Archive');
    expect(await useEmailStore.getState().ensureArchiveMailbox(client, email, request)).toEqual(archive);
    expect(request).not.toHaveBeenCalled();
    expect(client.createMailbox).not.toHaveBeenCalled();
  });

  it('does not prompt again after creating the archive', async () => {
    const request = vi.fn().mockResolvedValue('Archive');
    const first = await useEmailStore.getState().ensureArchiveMailbox(client, email, request);
    const second = await useEmailStore.getState().ensureArchiveMailbox(client, email, request);
    expect(first).toEqual(second);
    expect(request).toHaveBeenCalledOnce();
    expect(client.createMailbox).toHaveBeenCalledOnce();
  });

  it('does not move messages when folder creation fails', async () => {
    vi.mocked(client.createMailbox).mockRejectedValue(new Error('permission denied'));
    await expect(useEmailStore.getState().batchArchive(client, async () => 'Archive')).rejects.toThrow('permission denied');
    expect(client.batchArchiveEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails).toEqual([email]);
    expect(useEmailStore.getState().mailboxes).toEqual([inbox]);
  });

  it('creates the folder on the shared owner, not the personal account', async () => {
    const sharedInbox = { ...inbox, id: 'shared:inbox', originalId: 'inbox', isShared: true, accountId: 'shared' };
    const personalArchive = { ...inbox, id: 'own-archive', name: 'Archive', role: 'archive' };
    useEmailStore.setState({ selectedMailbox: sharedInbox.id, mailboxes: [personalArchive, sharedInbox] });
    const archive = await useEmailStore.getState().ensureArchiveMailbox(client, email, async () => 'Archive');
    expect(client.createMailbox).toHaveBeenCalledWith('Archive', undefined, 'shared', 'archive');
    expect(archive?.isShared).toBe(true);
    expect(archive?.id).toBe(`shared:${archive?.originalId}`);
  });

  it('uses the viewed account client and updates only its folder cache', async () => {
    const viewedClient = makeLoginClient();
    useAuthStore.setState({ getClientForAccount: id => id === 'viewed' ? viewedClient : undefined });
    useEmailStore.setState({ viewingAccountId: 'viewed', accountMailboxes: { viewed: [inbox] } });
    await useEmailStore.getState().ensureArchiveMailbox(client, email, async () => 'Archive');
    expect(viewedClient.createMailbox).toHaveBeenCalledWith('Archive', undefined, undefined, 'archive');
    expect(client.createMailbox).not.toHaveBeenCalled();
    expect(useEmailStore.getState().mailboxes).toEqual([inbox]);
    expect(useEmailStore.getState().accountMailboxes.viewed.some(mailbox => mailbox.role === 'archive')).toBe(true);
  });

  it('routes a unified shared source through its reaching client', async () => {
    const login = makeLoginClient();
    useAuthStore.setState({ getClientForAccount: id => id === 'login' ? login : undefined });
    useEmailStore.setState({ isUnifiedView: true, accountMailboxes: { shared: [{ ...inbox, accountId: 'shared', isShared: true }] } });
    const source = { ...email, sourceClientAccountId: 'login', sourceAccountId: 'shared' };
    await useEmailStore.getState().ensureArchiveMailbox(client, source, async () => 'Archive');
    expect(login.createMailbox).toHaveBeenCalledWith('Archive', undefined, 'shared', 'archive');
    expect(useEmailStore.getState().accountMailboxes.shared.some(mailbox => mailbox.role === 'archive')).toBe(true);
    expect(useEmailStore.getState().mailboxes).toEqual([inbox]);
  });
});
