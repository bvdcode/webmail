import { describe, expect, it } from 'vitest';
import type { FilterAction } from '@/lib/jmap/sieve-types';
import {
  countForwardActions,
  exceedsRedirectLimit,
  retainsLocalCopy,
} from '../forwarding-policy';

describe('forwarding policy', () => {
  it('counts only redirect-producing actions', () => {
    const actions: FilterAction[] = [
      { type: 'forward', value: 'first@example.org' },
      { type: 'mark_read' },
      { type: 'forward', value: 'second@example.org' },
    ];

    expect(countForwardActions(actions)).toBe(2);
  });

  it('enforces the redirect limit advertised by the server', () => {
    const actions: FilterAction[] = [
      { type: 'forward', value: 'first@example.org' },
      { type: 'forward', value: 'second@example.org' },
    ];

    expect(exceedsRedirectLimit(actions, 1)).toBe(true);
    expect(exceedsRedirectLimit(actions, 2)).toBe(false);
    expect(exceedsRedirectLimit(actions)).toBe(false);
  });

  it.each([
    { label: 'keep', action: { type: 'keep' } as const },
    { label: 'move', action: { type: 'move', value: 'Archive' } as const },
    { label: 'copy', action: { type: 'copy', value: 'Archive' } as const },
  ])(
    'treats $label as retaining a local copy',
    ({ action }) => {
      expect(retainsLocalCopy([
        { type: 'forward', value: 'first@example.org' },
        action,
      ])).toBe(true);
    },
  );

  it('does not mistake flag changes for local delivery', () => {
    expect(retainsLocalCopy([
      { type: 'forward', value: 'first@example.org' },
      { type: 'mark_read' },
      { type: 'add_label', value: 'important' },
    ])).toBe(false);
  });
});
