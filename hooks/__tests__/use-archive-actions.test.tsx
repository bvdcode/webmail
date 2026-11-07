import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import messages from '@/locales/en/common.json';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { DemoJMAPClient } from '@/lib/demo/demo-client';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailStore } from '@/stores/email-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useConfirmDialog } from '../use-confirm-dialog';
import { useArchiveActions } from '../use-archive-actions';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.unmock('next-intl');

function ArchiveView() {
  const { confirm, dialogProps } = useConfirmDialog();
  const { archiveSelected } = useArchiveActions(confirm);
  return <>
    <Button onClick={() => { void archiveSelected(); }}>Archive</Button>
    <ConfirmDialog {...dialogProps} />
  </>;
}

describe('archive folder confirmation dialog', () => {
  let client: DemoJMAPClient;

  beforeEach(async () => {
    vi.restoreAllMocks();
    client = new DemoJMAPClient();
    await client.deleteMailbox('demo-mailbox-archive');
    const mailboxes = await client.getAllMailboxes();
    const inbox = mailboxes.find(mailbox => mailbox.role === 'inbox')!;
    const { emails } = await client.getEmails(inbox.id);
    useAuthStore.setState({ client, activeAccountId: null });
    useSettingsStore.setState({ archiveMode: 'single' });
    useEmailStore.setState(useEmailStore.getInitialState(), true);
    useEmailStore.setState({ mailboxes, selectedMailbox: inbox.id, emails, selectedEmailIds: new Set([emails[0].id]) });
    vi.spyOn(client, 'createMailbox');
    vi.spyOn(client, 'batchArchiveEmails');
    render(<NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}><ArchiveView /></NextIntlClientProvider>);
  });

  it('asks with Yes and No before making any changes', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(messages.archive_dialog.missing_folder);
    expect(screen.getByRole('button', { name: 'Yes' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    await waitFor(() => { expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); });
    expect(client.createMailbox).not.toHaveBeenCalled();
    expect(client.batchArchiveEmails).not.toHaveBeenCalled();
  });

  it('creates the archive and moves mail only after Yes', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => { expect(client.batchArchiveEmails).toHaveBeenCalledOnce(); });
    expect(client.createMailbox).toHaveBeenCalledWith('Archive', undefined, undefined, 'archive');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('treats Escape as No', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(screen.getByRole('button', { name: 'No' }), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(client.createMailbox).not.toHaveBeenCalled();
  });

  it('does not open overlapping prompts on repeated clicks', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => { expect(client.createMailbox).toHaveBeenCalledOnce(); });
  });

  it('shows an error and keeps the message when folder creation is denied', async () => {
    vi.mocked(client.createMailbox).mockRejectedValue(new Error('permission denied'));
    const selectedId = [...useEmailStore.getState().selectedEmailIds][0];
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => { expect(toast.error).toHaveBeenCalledWith(messages.archive_dialog.error); });
    expect(client.batchArchiveEmails).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emails.some(email => email.id === selectedId)).toBe(true);
  });
});
