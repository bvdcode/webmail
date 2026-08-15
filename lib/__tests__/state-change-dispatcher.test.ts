import { describe, expect, it, vi } from 'vitest';
import { StateChangeDispatcher } from '@/lib/jmap/state-change-dispatcher';
import type { StateChange } from '@/lib/jmap/types';

function stateChange(
  accountId: string,
  changes: StateChange['changed'][string],
): StateChange {
  return {
    '@type': 'StateChange',
    changed: { [accountId]: changes },
  };
}

describe('StateChangeDispatcher', () => {
  it('coalesces a synchronous SSE backlog into one state change', async () => {
    const handler = vi.fn<(change: StateChange) => void>();
    const dispatcher = new StateChangeDispatcher();
    dispatcher.setHandler(handler);

    const first = dispatcher.dispatch(stateChange('account-1', { Email: 'e1' }));
    const second = dispatcher.dispatch(stateChange('account-1', { Mailbox: 'm1' }));
    const third = dispatcher.dispatch(stateChange('account-2', { Email: 'e2' }));
    await Promise.all([first, second, third]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      '@type': 'StateChange',
      changed: {
        'account-1': { Email: 'e1', Mailbox: 'm1' },
        'account-2': { Email: 'e2' },
      },
    });
  });

  it('never overlaps async state-change handling', async () => {
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let activeHandlers = 0;
    let maximumActiveHandlers = 0;
    const handled: StateChange[] = [];
    const dispatcher = new StateChangeDispatcher();
    dispatcher.setHandler(async (change) => {
      activeHandlers++;
      maximumActiveHandlers = Math.max(maximumActiveHandlers, activeHandlers);
      handled.push(change);
      if (handled.length === 1) {
        await firstGate;
      }
      activeHandlers--;
    });

    const first = dispatcher.dispatch(stateChange('account-1', { Email: 'e1' }));
    await Promise.resolve();
    const second = dispatcher.dispatch(stateChange('account-1', { Email: 'e2' }));
    const third = dispatcher.dispatch(stateChange('account-1', { Mailbox: 'm2' }));
    releaseFirst();
    await Promise.all([first, second, third]);

    expect(maximumActiveHandlers).toBe(1);
    expect(handled).toEqual([
      stateChange('account-1', { Email: 'e1' }),
      stateChange('account-1', { Email: 'e2', Mailbox: 'm2' }),
    ]);
  });
});
