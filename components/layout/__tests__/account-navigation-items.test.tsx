import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountNavigationItems } from '../account-navigation-items';

describe('AccountNavigationItems', () => {
  it('shows supported apps and account-level utilities', () => {
    const onNavigate = vi.fn();
    const onShowShortcuts = vi.fn();
    render(
      <AccountNavigationItems
        showCalendar
        showContacts
        showFiles
        onNavigate={onNavigate}
        onShowShortcuts={onShowShortcuts}
      />,
    );

    fireEvent.click(screen.getByText('calendar'));
    fireEvent.click(screen.getByText('contacts'));
    fireEvent.click(screen.getByText('files'));
    fireEvent.click(screen.getByText('settings'));
    fireEvent.click(screen.getByText('keyboard_shortcuts'));

    expect(onNavigate).toHaveBeenNthCalledWith(1, '/calendar');
    expect(onNavigate).toHaveBeenNthCalledWith(2, '/contacts');
    expect(onNavigate).toHaveBeenNthCalledWith(3, '/files');
    expect(onNavigate).toHaveBeenNthCalledWith(4, '/settings');
    expect(onShowShortcuts).toHaveBeenCalledOnce();
  });

  it('hides unsupported apps without hiding settings or shortcuts', () => {
    render(
      <AccountNavigationItems
        showCalendar={false}
        showContacts={false}
        showFiles={false}
        onNavigate={() => {}}
        onShowShortcuts={() => {}}
      />,
    );

    expect(screen.queryByText('calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('contacts')).not.toBeInTheDocument();
    expect(screen.queryByText('files')).not.toBeInTheDocument();
    expect(screen.getByText('settings')).toBeInTheDocument();
    expect(screen.getByText('keyboard_shortcuts')).toBeInTheDocument();
  });
});
