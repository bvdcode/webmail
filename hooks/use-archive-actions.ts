import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Email } from '@/lib/jmap/types';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailStore } from '@/stores/email-store';
import type { useConfirmDialog } from './use-confirm-dialog';

export function useArchiveActions(confirm: ReturnType<typeof useConfirmDialog>['confirm']) {
  const t = useTranslations('archive_dialog');
  const tCommon = useTranslations('common');
  const tSidebar = useTranslations('sidebar.mailboxes');
  const pending = useRef(false);

  const requestCreation = async () => {
    const accepted = await confirm({
      title: tSidebar('archive'),
      message: t('missing_folder'),
      confirmText: tCommon('yes'),
      cancelText: tCommon('no'),
    });
    return accepted ? tSidebar('archive') : null;
  };

  const ensureArchiveMailbox = async (email: Email) => {
    const client = useAuthStore.getState().client;
    if (!client || pending.current) {
      return null;
    }
    pending.current = true;
    try {
      return await useEmailStore.getState().ensureArchiveMailbox(client, email, requestCreation);
    } catch {
      toast.error(t('error'));
      return null;
    } finally {
      pending.current = false;
    }
  };

  const archiveSelected = async () => {
    const client = useAuthStore.getState().client;
    if (!client || pending.current) {
      return;
    }
    pending.current = true;
    try {
      await useEmailStore.getState().batchArchive(client, requestCreation);
    } catch {
      toast.error(t('error'));
    } finally {
      pending.current = false;
    }
  };

  return { ensureArchiveMailbox, archiveSelected };
}
