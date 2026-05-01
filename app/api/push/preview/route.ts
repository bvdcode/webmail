import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getStalwartCredentials } from '@/lib/stalwart/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JmapMethodResponse = [string, Record<string, unknown>, string];

type EmailLite = {
  id: string;
  threadId: string;
  from?: { name?: string | null; email?: string }[] | null;
  subject?: string | null;
  preview?: string | null;
  receivedAt?: string | null;
};

async function postJmap(
  apiUrl: string,
  authHeader: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();

  if (!res.ok) {
    logger.error('push preview JMAP HTTP request failed', {
      status: res.status,
      body: raw.slice(0, 2000),
    });

    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'JMAP request failed' },
        { status: 502 },
      ),
    };
  }

  try {
    return {
      ok: true as const,
      data: JSON.parse(raw) as { methodResponses: JmapMethodResponse[] },
    };
  } catch (error) {
    logger.error('push preview JMAP response parse failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      body: raw.slice(0, 2000),
    });

    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Invalid JMAP response' },
        { status: 502 },
      ),
    };
  }
}

function getJmapError(data: { methodResponses: JmapMethodResponse[] }) {
  return data.methodResponses.find(([method]) => method === 'error');
}

/**
 * GET /api/push/preview
 *
 * Called from the service worker when a Web Push wake-up arrives. Fetches the
 * latest unread email so the SW can build an enriched system notification
 * without exposing JMAP credentials to the SW context.
 */
export async function GET(request: NextRequest) {
  try {
    const creds = await getStalwartCredentials(request);
    if (!creds) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessionRes = await fetch(`${creds.serverUrl}/.well-known/jmap`, {
      headers: { Authorization: creds.authHeader },
    });

    if (!sessionRes.ok) {
      return NextResponse.json({ error: 'JMAP session failed' }, { status: 502 });
    }

    const session = (await sessionRes.json()) as {
      apiUrl?: string;
      primaryAccounts?: Record<string, string>;
    };

    const apiUrl = session.apiUrl;
    const accountId = session.primaryAccounts?.['urn:ietf:params:jmap:mail'];

    if (!apiUrl || !accountId) {
      return NextResponse.json({ error: 'Incomplete JMAP session' }, { status: 502 });
    }

    const inboxQuery = await postJmap(apiUrl, creds.authHeader, {
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: [
        [
          'Mailbox/query',
          {
            accountId,
            filter: { role: 'inbox' },
            limit: 1,
          },
          'mb',
        ],
      ],
    });

    if (!inboxQuery.ok) {
      return inboxQuery.response;
    }

    const inboxError = getJmapError(inboxQuery.data);
    if (inboxError) {
      logger.error('push preview Mailbox/query failed', {
        error: inboxError[1],
      });

      return NextResponse.json({ error: 'JMAP mailbox query failed' }, { status: 502 });
    }

    const mailboxQueryBody = inboxQuery.data.methodResponses.find(
      ([method]) => method === 'Mailbox/query',
    )?.[1] as { ids?: string[] } | undefined;

    const inboxId = mailboxQueryBody?.ids?.[0];

    if (!inboxId) {
      return NextResponse.json(
        {
          email: null,
          unreadTotal: 0,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const emailQuery = await postJmap(apiUrl, creds.authHeader, {
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: [
        [
          'Email/query',
          {
            accountId,
            filter: {
              operator: 'AND',
              conditions: [
                { inMailbox: inboxId },
                { notKeyword: '$seen' },
              ],
            },
            sort: [{ property: 'receivedAt', isAscending: false }],
            limit: 1,
            calculateTotal: true,
          },
          'eq',
        ],
        [
          'Email/get',
          {
            accountId,
            '#ids': { resultOf: 'eq', name: 'Email/query', path: '/ids' },
            properties: ['id', 'threadId', 'from', 'subject', 'preview', 'receivedAt'],
          },
          'eg',
        ],
      ],
    });

    if (!emailQuery.ok) {
      return emailQuery.response;
    }

    const emailError = getJmapError(emailQuery.data);
    if (emailError) {
      logger.error('push preview Email query/get failed', {
        error: emailError[1],
      });

      return NextResponse.json({ error: 'JMAP email query failed' }, { status: 502 });
    }

    let email: EmailLite | null = null;
    let unreadTotal = 0;

    for (const [method, body] of emailQuery.data.methodResponses) {
      if (method === 'Email/query') {
        unreadTotal = ((body as { total?: number }).total) ?? 0;
      }

      if (method === 'Email/get') {
        const list = (body as { list?: EmailLite[] }).list ?? [];
        email = list[0] ?? null;
      }
    }

    return NextResponse.json(
      {
        email,
        unreadTotal,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const err = error as Error & { cause?: { code?: string; message?: string } };

    logger.error('push preview failed', {
      error: err?.message ?? 'Unknown error',
      causeCode: err?.cause?.code,
      causeMessage: err?.cause?.message,
    });

    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
