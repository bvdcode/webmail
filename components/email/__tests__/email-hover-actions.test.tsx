import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '@/lib/jmap/types';
import { useSettingsStore } from '@/stores/settings-store';
import { EmailHoverActions } from '../email-hover-actions';

const mobile = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => mobile.value }));

const email: Email = {
  id: 'message-1', threadId: 'thread-1', mailboxIds: { inbox: true },
  keywords: {}, size: 100, receivedAt: '2026-11-07T12:00:00Z',
  subject: 'Subject', hasAttachment: false,
};

describe('EmailHoverActions', () => {
  beforeEach(() => {
    mobile.value = false;
    useSettingsStore.setState({
      hoverActions: ['delete', 'star', 'markRead', 'archive'],
      hoverActionsMode: 'inline', hoverActionsCorner: 'top-right',
    });
  });

  it('reserves a metadata slot instead of overlaying the message body', () => {
    render(<EmailHoverActions email={email}><span>12:00</span></EmailHoverActions>);
    const slot = screen.getByTestId('email-quick-actions');
    expect(slot).toHaveClass('grid');
    expect(slot).not.toHaveClass('absolute');
    expect(slot).toContainElement(screen.getByText('12:00'));
    expect(slot).toContainElement(screen.getByLabelText('archive'));
    expect(screen.getByLabelText('archive').parentElement).toHaveClass('group-focus-within:opacity-100');
  });

  it.each([false, true])('labels and dispatches the read toggle (seen=%s)', (seen) => {
    const onMarkAsRead = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <EmailHoverActions email={{ ...email, keywords: { $seen: seen } }} onMarkAsRead={onMarkAsRead} />
      </div>,
    );
    fireEvent.click(screen.getByLabelText(seen ? 'mark_unread' : 'mark_read'));
    expect(onMarkAsRead).toHaveBeenCalledWith(!seen);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it.each(['mobile', 'disabled', 'scheduled'])('preserves metadata when actions are %s', (mode) => {
    mobile.value = mode === 'mobile';
    if (mode === 'disabled') {
      useSettingsStore.setState({ hoverActions: [] });
    }
    render(
      <EmailHoverActions email={{ ...email, isScheduled: mode === 'scheduled' }}>
        <span>12:00</span>
      </EmailHoverActions>,
    );
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('preserves the explicit floating preference and metadata', () => {
    useSettingsStore.setState({ hoverActionsMode: 'floating' });
    render(<EmailHoverActions email={email}><span>12:00</span></EmailHoverActions>);
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByLabelText('archive')).toBeInTheDocument();
    expect(screen.queryByTestId('email-quick-actions')).not.toBeInTheDocument();
  });
});
