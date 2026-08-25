import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FilterAction } from '@/lib/jmap/sieve-types';
import { ForwardingPolicyNotice } from '../forwarding-policy-notice';

const TWO_FORWARDS: FilterAction[] = [
  { type: 'forward', value: 'first@example.org' },
  { type: 'forward', value: 'second@example.org' },
];

describe('ForwardingPolicyNotice', () => {
  it('shows the Stalwart limit error when the rule has too many redirects', () => {
    render(
      <ForwardingPolicyNotice
        actions={TWO_FORWARDS}
        maxNumberRedirects={1}
        onAddKeep={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('forward_limit_exceeded');
  });

  it('shows the server limit guidance for a valid forwarding rule', () => {
    render(
      <ForwardingPolicyNotice
        actions={[TWO_FORWARDS[0]]}
        maxNumberRedirects={1}
        onAddKeep={() => {}}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('forward_limit');
  });

  it('explains local-copy behavior and offers to add keep', () => {
    const onAddKeep = vi.fn();
    render(
      <ForwardingPolicyNotice
        actions={[TWO_FORWARDS[0]]}
        maxNumberRedirects={1}
        onAddKeep={onAddKeep}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent('forward_removes_local_copy');
    fireEvent.click(screen.getByRole('button', { name: 'action_types.keep' }));
    expect(onAddKeep).toHaveBeenCalledOnce();
  });

  it('does not warn about local removal when keep is present', () => {
    render(
      <ForwardingPolicyNotice
        actions={[TWO_FORWARDS[0], { type: 'keep' }]}
        maxNumberRedirects={1}
        onAddKeep={() => {}}
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
