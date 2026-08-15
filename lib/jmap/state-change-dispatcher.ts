import type { StateChange } from './types';

export type StateChangeHandler = (change: StateChange) => void | Promise<void>;

type StateChangeErrorHandler = (error: Error) => void;

function mergeStateChanges(
  current: StateChange | null,
  incoming: StateChange,
): StateChange {
  if (!current) {
    return incoming;
  }

  const changed = { ...current.changed };
  for (const [accountId, accountChanges] of Object.entries(incoming.changed)) {
    changed[accountId] = {
      ...changed[accountId],
      ...accountChanges,
    };
  }

  return {
    '@type': 'StateChange',
    changed,
  };
}

/**
 * Coalesces bursts of JMAP state changes and keeps their async consumer
 * single-flight. Browsers can release a backlog of SSE events when a hidden
 * tab becomes visible; processing each event concurrently causes duplicate
 * mailbox refreshes and overlapping notification sounds.
 */
export class StateChangeDispatcher {
  private handler: StateChangeHandler | null = null;
  private pending: StateChange | null = null;
  private dispatching: Promise<void> | null = null;

  constructor(private readonly onError?: StateChangeErrorHandler) {}

  setHandler(handler: StateChangeHandler): void {
    this.handler = handler;
  }

  getHandler(): StateChangeHandler | null {
    return this.handler;
  }

  hasHandler(): boolean {
    return this.handler !== null;
  }

  clear(): void {
    this.handler = null;
    this.pending = null;
  }

  dispatch(change: StateChange): Promise<void> {
    this.pending = mergeStateChanges(this.pending, change);

    if (!this.dispatching) {
      // Defer one microtask so a synchronous SSE backlog becomes one batch.
      this.dispatching = Promise.resolve()
        .then(() => this.drain())
        .finally(() => {
          this.dispatching = null;
        });
    }

    return this.dispatching;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const change = this.pending;
      this.pending = null;
      const handler = this.handler;
      if (!handler) {
        continue;
      }

      try {
        await handler(change);
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.onError?.(normalized);
      }
    }
  }
}
