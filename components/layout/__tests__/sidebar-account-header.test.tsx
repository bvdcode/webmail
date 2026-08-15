import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarAccountHeader } from '../sidebar-account-header';

vi.mock('../account-switcher', () => ({
  AccountSwitcher: () => <button type="button" aria-label="profile-menu">Profile</button>,
}));

describe('SidebarAccountHeader', () => {
  it('puts the profile menu before a separate collapse control', () => {
    const onToggleCollapsed = vi.fn();
    render(
      <SidebarAccountHeader
        isCollapsed={false}
        onToggleCollapsed={onToggleCollapsed}
      />,
    );

    const buttons = within(screen.getByTestId('sidebar-account-header')).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'close',
      'profile-menu',
      'collapse_tooltip',
    ]);

    fireEvent.click(screen.getByTestId('sidebar-collapse-toggle'));
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it('shows only the desktop expand control when collapsed', () => {
    render(
      <SidebarAccountHeader
        isCollapsed
        onToggleCollapsed={() => {}}
      />,
    );

    expect(screen.queryByLabelText('profile-menu')).not.toBeInTheDocument();
    expect(screen.getByLabelText('expand_tooltip')).toBeInTheDocument();
  });
});
