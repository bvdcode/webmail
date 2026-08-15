import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email, Mailbox } from '@/lib/jmap/types';
import { useUIStore } from '@/stores/ui-store';
import { EmailContextMenu } from '../email-context-menu';

const RIGHTS: Mailbox['myRights'] = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
};

const EMAIL: Email = {
  id: 'email-1',
  threadId: 'thread-1',
  mailboxIds: { inbox: true },
  keywords: {},
  size: 100,
  receivedAt: '2026-08-15T12:00:00Z',
  subject: 'Test message',
  hasAttachment: true,
  blobId: 'blob-1',
};

const MAILBOXES: Mailbox[] = [
  {
    id: 'inbox',
    name: 'Inbox',
    role: 'inbox',
    sortOrder: 0,
    totalEmails: 1,
    unreadEmails: 1,
    totalThreads: 1,
    unreadThreads: 1,
    myRights: RIGHTS,
    isSubscribed: true,
  },
  {
    id: 'archive',
    name: 'Archive',
    role: 'archive',
    sortOrder: 1,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: RIGHTS,
    isSubscribed: true,
  },
];

const ACTIONS = {
  onReply: vi.fn(),
  onReplyAll: vi.fn(),
  onForward: vi.fn(),
  onForwardAsAttachment: vi.fn(),
  onMarkAsRead: vi.fn(),
  onToggleStar: vi.fn(),
  onTogglePinned: vi.fn(),
  onDelete: vi.fn(),
  onArchive: vi.fn(),
  onSetTag: vi.fn(),
  onCreateFilter: vi.fn(),
  onMoveToMailbox: vi.fn(),
  onMarkAsSpam: vi.fn(),
  onBatchMarkAsRead: vi.fn(),
  onBatchDelete: vi.fn(),
  onBatchArchive: vi.fn(),
  onBatchMoveToMailbox: vi.fn(),
  onBatchMarkAsSpam: vi.fn(),
};

function renderMenu(overrides: Partial<React.ComponentProps<typeof EmailContextMenu>> = {}) {
  return render(
    <EmailContextMenu
      email={EMAIL}
      position={{ x: 10, y: 10 }}
      isOpen
      onClose={() => {}}
      menuRef={createRef<HTMLDivElement>()}
      mailboxes={MAILBOXES}
      selectedMailbox="inbox"
      currentMailboxRole="inbox"
      {...ACTIONS}
      {...overrides}
    />,
  );
}

describe('EmailContextMenu', () => {
  beforeEach(() => {
    useUIStore.setState({ isMobile: false, isTablet: false, isDesktop: true });
    vi.clearAllMocks();
  });

  it('keeps the desktop single-message menu focused on unique actions', () => {
    renderMenu();

    expect(screen.getByText('reply')).toBeInTheDocument();
    expect(screen.getByText('reply_all')).toBeInTheDocument();
    expect(screen.getByText('forward')).toBeInTheDocument();
    expect(screen.getByText('move_to')).toBeInTheDocument();
    expect(screen.getByText('create_filter')).toBeInTheDocument();
    expect(screen.getByText('mark_as_spam')).toBeInTheDocument();

    expect(screen.queryByText('forward_as_attachment')).not.toBeInTheDocument();
    expect(screen.queryByText('copy_message')).not.toBeInTheDocument();
    expect(screen.queryByText('copy_conversation')).not.toBeInTheDocument();
    expect(screen.queryByText('archive')).not.toBeInTheDocument();
    expect(screen.queryByText('delete')).not.toBeInTheDocument();
    expect(screen.queryByText('star')).not.toBeInTheDocument();
    expect(screen.queryByText('pin')).not.toBeInTheDocument();
    expect(screen.queryByText('tag')).not.toBeInTheDocument();
    expect(screen.queryByText('mark_read')).not.toBeInTheDocument();
  });

  it('keeps the full single-message action set on mobile', () => {
    useUIStore.setState({ isMobile: true, isTablet: false, isDesktop: false });
    renderMenu();

    expect(screen.getByText('forward_as_attachment')).toBeInTheDocument();
    expect(screen.getByText('copy_message')).toBeInTheDocument();
    expect(screen.getByText('copy_conversation')).toBeInTheDocument();
    expect(screen.getByText('archive')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(screen.getByText('star')).toBeInTheDocument();
    expect(screen.getByText('pin')).toBeInTheDocument();
    expect(screen.getByText('tag')).toBeInTheDocument();
    expect(screen.getByText('mark_read')).toBeInTheDocument();
  });

  it('keeps batch operations available on desktop', () => {
    renderMenu({ isMultiSelect: true, selectedCount: 2 });

    expect(screen.getByText('items_selected')).toBeInTheDocument();
    expect(screen.getByText('archive')).toBeInTheDocument();
    expect(screen.getByText('delete')).toBeInTheDocument();
    expect(screen.getByText('move_to')).toBeInTheDocument();
    expect(screen.getByText('mark_as_spam')).toBeInTheDocument();
    expect(screen.getByText('mark_read')).toBeInTheDocument();
    expect(screen.queryByText('reply')).not.toBeInTheDocument();
    expect(screen.queryByText('create_filter')).not.toBeInTheDocument();
  });
});
