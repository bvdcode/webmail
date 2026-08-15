import { useAuthStore } from '@/stores/auth-store';
import { useCalendarStore } from '@/stores/calendar-store';
import { usePolicyStore } from '@/stores/policy-store';

export interface NavigationCapabilities {
  calendar: boolean;
  contacts: boolean;
  files: boolean;
}

export function useNavigationCapabilities(): NavigationCapabilities {
  const supportsCalendar = useCalendarStore((state) => state.supportsCalendar);
  const client = useAuthStore((state) => state.client);
  const calendarEnabled = usePolicyStore((state) => state.isFeatureEnabled('calendarEnabled'));
  const contactsEnabled = usePolicyStore((state) => state.isFeatureEnabled('contactsEnabled'));
  const filesEnabled = usePolicyStore((state) => state.isFeatureEnabled('filesEnabled'));

  return {
    calendar: supportsCalendar && calendarEnabled,
    contacts: (client?.supportsContacts() ?? false) && contactsEnabled,
    files: (client?.supportsFiles() ?? false) && filesEnabled,
  };
}
