import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  readContext: vi.fn(),
  getCredentials: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}));

vi.mock('@/lib/stalwart/auth-context', () => ({
  readStalwartAuthContextFromStore: mocks.readContext,
}));

vi.mock('@/lib/stalwart/credentials', () => ({
  getStalwartCredentials: mocks.getCredentials,
}));

import { GET } from './route';

const REQUEST_URL = 'https://mail.example.test/api/push/preview?accountId=account-1';
const AUTH_CONTEXT = {
  serverUrl: 'https://jmap.example.test',
  username: 'user@example.test',
  authHeader: 'Basic credential',
};

describe('push preview target resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.cookies.mockReset();
    mocks.readContext.mockReset();
    mocks.getCredentials.mockReset();
    mocks.cookies.mockResolvedValue({});
  });

  it('returns 401 only when no stored auth context exists', async () => {
    mocks.readContext.mockReturnValue(null);

    const response = await GET(new NextRequest(REQUEST_URL));

    expect(response.status).toBe(401);
  });

  it('returns 502 when the JMAP probe fails', async () => {
    mocks.readContext.mockImplementation((_store, slot) => (
      slot === 0 ? AUTH_CONTEXT : null
    ));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const response = await GET(new NextRequest(REQUEST_URL));
    expect(response.status).toBe(502);
  });

  it('returns 504 when the JMAP endpoint is unreachable', async () => {
    mocks.readContext.mockImplementation((_store, slot) => (
      slot === 0 ? AUTH_CONTEXT : null
    ));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const response = await GET(new NextRequest(REQUEST_URL));

    expect(response.status).toBe(502);
  });

  it('returns 404 when JMAP rejects the requested account', async () => {
    mocks.readContext.mockImplementation((_store, slot) => (
      slot === 0 ? AUTH_CONTEXT : null
    ));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      methodResponses: [
        ['error', { type: 'accountNotFound' }, 'mb'],
      ],
    })));

    const response = await GET(new NextRequest(REQUEST_URL));

    expect(response.status).toBe(404);
  });

  it('resolves the account and Inbox with one canonical JMAP probe', async () => {
    mocks.readContext.mockImplementation((_store, slot) => (
      slot === 0 ? AUTH_CONTEXT : null
    ));
    const request = vi.fn().mockResolvedValue(Response.json({
      methodResponses: [
        ['Mailbox/query', { ids: [] }, 'mb'],
      ],
    }));
    vi.stubGlobal('fetch', request);

    const response = await GET(new NextRequest(REQUEST_URL));

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0];
    expect(url.toString()).toBe('https://jmap.example.test/jmap/');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: AUTH_CONTEXT.authHeader,
        'Content-Type': 'application/json',
      },
      redirect: 'manual',
    });
    expect(JSON.parse(init.body)).toMatchObject({
      methodCalls: [
        ['Mailbox/query', { accountId: 'account-1' }, 'mb'],
      ],
    });
  });

  it('returns sender and subject from the requested account', async () => {
    mocks.readContext.mockImplementation((_store, slot) => (
      slot === 0 ? AUTH_CONTEXT : null
    ));
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({
        methodResponses: [
          ['Mailbox/query', { ids: ['inbox-1'] }, 'mb'],
        ],
      }))
      .mockResolvedValueOnce(Response.json({
        methodResponses: [
          ['Email/query', { ids: ['email-1'], total: 1 }, 'eq'],
          ['Email/get', {
            list: [{
              id: 'email-1',
              threadId: 'thread-1',
              from: [{ name: 'Test Sender', email: 'sender@example.test' }],
              subject: 'Test subject',
            }],
          }, 'eg'],
        ],
      }));
    vi.stubGlobal('fetch', request);

    const response = await GET(new NextRequest(REQUEST_URL));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      unreadTotal: 1,
      email: {
        id: 'email-1',
        from: [{ name: 'Test Sender' }],
        subject: 'Test subject',
      },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
