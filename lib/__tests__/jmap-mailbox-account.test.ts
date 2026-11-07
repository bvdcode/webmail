import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JMAPClient } from '../jmap/client';

type JMAPMethodCall = [string, Record<string, unknown>, string];

function createClient(): JMAPClient {
  const client = new JMAPClient('https://jmap.example.com', 'user@example.com', 'pass');
  Object.assign(client, {
    apiUrl: 'https://jmap.example.com/api',
    accountId: 'primary-account',
    username: 'user@example.com',
    accounts: {
      'primary-account': { name: 'user@example.com' },
      'shared-account': { name: 'team@example.com' },
    },
  });
  return client;
}

function mockMailboxSet(): JMAPMethodCall[] {
  const captured: JMAPMethodCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse((init as { body: string }).body) as { methodCalls: JMAPMethodCall[] };
    const call = body.methodCalls[0];
    const args = call[1];
    captured.push(call);

    let result: Record<string, unknown>;
    if (args.create) {
      const createId = Object.keys(args.create as Record<string, unknown>)[0];
      result = { created: { [createId]: { id: 'created-mailbox' } } };
    } else if (args.update) {
      result = { updated: Object.fromEntries(Object.keys(args.update as Record<string, unknown>).map((id) => [id, null])) };
    } else {
      result = { destroyed: args.destroy };
    }

    return new Response(JSON.stringify({ methodResponses: [['Mailbox/set', result, '0']] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return captured;
}

describe('JMAP mailbox mutations use the requested account', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('creates a mailbox in a shared account and returns correctly scoped metadata', async () => {
    const client = createClient();
    const captured = mockMailboxSet();

    const mailbox = await client.createMailbox('Child', 'parent-id', 'shared-account');

    expect(captured[0][0]).toBe('Mailbox/set');
    expect(captured[0][1].accountId).toBe('shared-account');
    expect(Object.values(captured[0][1].create as Record<string, unknown>))
      .toEqual([{ name: 'Child', parentId: 'parent-id' }]);
    expect(mailbox).toMatchObject({
      id: 'created-mailbox',
      accountId: 'shared-account',
      accountName: 'team@example.com',
      isShared: true,
    });
  });

  it('creates the archive name and role in one request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    const client = createClient();
    const captured = mockMailboxSet();
    const mailbox = await client.createMailbox('Archive', undefined, 'shared-account', 'archive');
    expect(captured).toEqual([['Mailbox/set', {
      accountId: 'shared-account',
      create: { 'new-123': { name: 'Archive', role: 'archive' } },
    }, '0']]);
    expect(mailbox.role).toBe('archive');
  });

  it('reports a refused archive creation without issuing another request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    const client = createClient();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      methodResponses: [['Mailbox/set', { notCreated: { 'new-123': { type: 'forbidden' } } }, '0']],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(client.createMailbox('Archive', undefined, undefined, 'archive')).rejects.toThrow('forbidden');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('updates a mailbox in the explicit shared account', async () => {
    const client = createClient();
    const captured = mockMailboxSet();

    await client.updateMailbox('mailbox-id', { name: 'Renamed' }, 'shared-account');

    expect(captured[0][1]).toMatchObject({
      accountId: 'shared-account',
      update: { 'mailbox-id': { name: 'Renamed' } },
    });
  });

  it('deletes a mailbox from the explicit shared account', async () => {
    const client = createClient();
    const captured = mockMailboxSet();

    await client.deleteMailbox('mailbox-id', 'shared-account');

    expect(captured[0][1]).toMatchObject({
      accountId: 'shared-account',
      destroy: ['mailbox-id'],
    });
  });

  it('keeps update and delete on the primary account when no account is supplied', async () => {
    const client = createClient();
    const captured = mockMailboxSet();

    await client.updateMailbox('mailbox-id', { sortOrder: 3 });
    await client.deleteMailbox('mailbox-id');

    expect(captured).toHaveLength(2);
    expect(captured[0][1].accountId).toBe('primary-account');
    expect(captured[1][1].accountId).toBe('primary-account');
  });
});
