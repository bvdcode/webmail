import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { attachmentNameProblem, splitAttachmentName } from '@/lib/attachment-rename';

export function useAttachmentRename<T>(onRename: (target: T, name: string) => void) {
  const t = useTranslations('attachment_rename');
  const [pending, setPending] = useState<{ target: T; name: string } | null>(null);
  const [stem, suffix] = splitAttachmentName(pending?.name || '');
  return {
    rename: (target: T, name: string) => setPending({ target, name }),
    label: (name: string) => t('rename_named', { name }),
    dialogProps: {
      isOpen: pending !== null,
      title: t('rename_title'),
      confirmText: t('rename'),
      defaultValue: stem,
      suffix,
      validate: (name: string) => {
        const problem = attachmentNameProblem(name);
        return problem ? t(problem) : null;
      },
      onClose: () => setPending(null),
      onSubmit: (name: string) => {
        if (pending && name + suffix !== pending.name) {
          onRename(pending.target, name + suffix);
        }
      },
    },
  };
}
