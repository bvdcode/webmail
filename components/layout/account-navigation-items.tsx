"use client";

import { BookUser, Calendar, HardDrive, Keyboard, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type AccountNavigationDestination = '/calendar' | '/contacts' | '/files' | '/settings';

interface AccountNavigationItemsProps {
  showCalendar: boolean;
  showContacts: boolean;
  showFiles: boolean;
  onNavigate: (destination: AccountNavigationDestination) => void;
  onShowShortcuts: () => void;
}

export function AccountNavigationItems({
  showCalendar,
  showContacts,
  showFiles,
  onNavigate,
  onShowShortcuts,
}: AccountNavigationItemsProps) {
  const t = useTranslations('sidebar');

  return (
    <div className="border-t border-border py-1">
      {showCalendar && (
        <button
          type="button"
          onClick={() => onNavigate('/calendar')}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          role="menuitem"
        >
          <Calendar className="w-4 h-4" />
          {t('calendar')}
        </button>
      )}
      {showContacts && (
        <button
          type="button"
          onClick={() => onNavigate('/contacts')}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          role="menuitem"
        >
          <BookUser className="w-4 h-4" />
          {t('contacts')}
        </button>
      )}
      {showFiles && (
        <button
          type="button"
          onClick={() => onNavigate('/files')}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          role="menuitem"
        >
          <HardDrive className="w-4 h-4" />
          {t('files')}
        </button>
      )}
      <button
        type="button"
        onClick={() => onNavigate('/settings')}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
        role="menuitem"
      >
        <Settings className="w-4 h-4" />
        {t('settings')}
      </button>
      <button
        type="button"
        onClick={onShowShortcuts}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
        role="menuitem"
      >
        <Keyboard className="w-4 h-4" />
        {t('keyboard_shortcuts')}
      </button>
    </div>
  );
}
