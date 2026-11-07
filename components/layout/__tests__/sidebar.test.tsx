import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore, DEFAULT_KEYWORDS } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { useAccountStore } from '@/stores/account-store';
import { Sidebar } from '../sidebar';
import { DragDropProvider } from '@/contexts/drag-drop-context';

vi.mock('../sidebar-account-header', () => ({ SidebarAccountHeader: () => null }));
vi.mock('@/components/tour/tour-provider', () => ({
  useTour: () => ({ startTour: vi.fn(), resetTourCompletion: vi.fn() }),
}));

describe('Sidebar navigation', () => {
  beforeEach(() => {
    useUIStore.setState({ sidebarCollapsed: false, isDesktop: true });
    useAccountStore.setState({ accounts: [] });
    useSettingsStore.setState({ showTagsInSidebar: false, emailKeywords: [...DEFAULT_KEYWORDS] });
  });

  it('keeps the only folder section open without a disclosure button', () => {
    render(<DragDropProvider><Sidebar mailboxes={[]} /></DragDropProvider>);
    expect(screen.getByText('folders').closest('button')).toBeNull();
    expect(screen.getByText('loading_mailboxes')).toBeInTheDocument();
  });

  it('retains section collapse when tags are also visible', () => {
    useSettingsStore.setState({ showTagsInSidebar: true });
    render(<DragDropProvider><Sidebar mailboxes={[]} /></DragDropProvider>);
    const heading = screen.getByText('folders').closest('button');
    expect(heading).not.toBeNull();
    if (!heading) {
      throw new Error('Missing folder section control');
    }
    fireEvent.click(heading);
    expect(screen.queryByText('loading_mailboxes')).not.toBeInTheDocument();
  });

  it('provides a labeled compose button at the end of the navigation', () => {
    const onCompose = vi.fn();
    render(<DragDropProvider><Sidebar mailboxes={[]} onCompose={onCompose} /></DragDropProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'compose' }));
    expect(onCompose).toHaveBeenCalledOnce();
    expect(screen.getByText('compose')).toBeInTheDocument();
  });

  it('keeps compose accessible in the collapsed sidebar', () => {
    useUIStore.setState({ sidebarCollapsed: true });
    render(<DragDropProvider><Sidebar mailboxes={[]} onCompose={() => {}} /></DragDropProvider>);
    expect(screen.getByRole('button', { name: 'compose' })).toBeInTheDocument();
    expect(screen.queryByText('compose')).not.toBeInTheDocument();
  });
});
