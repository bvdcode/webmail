import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import JSZip from 'jszip';
import { JMAPClient } from '@/lib/jmap/client';
import type { Email } from '@/lib/jmap/types';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useEmailStore } from '@/stores/email-store';
import { useToastStore } from '@/stores/toast-store';
import en from '@/locales/en/common.json';
import { EmailViewer } from '../email-viewer';

vi.unmock('next-intl');
vi.mock('@/components/tour/tour-provider', () => ({ useTour: () => ({ startTour: vi.fn() }) }));
vi.mock('@/components/plugins/plugin-slot', () => ({ PluginSlot: () => null }));
vi.mock('@/hooks/use-media-query', () => ({
  useDeviceDetection: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
  useMediaQuery: () => false,
  useIsDesktop: () => true,
}));

const initialAuth = useAuthStore.getState();
const initialEmail = useEmailStore.getState();
const initialSettings = useSettingsStore.getState();
const message: Email = {
  id: 'message', threadId: 'thread', subject: 'Attachments', from: [{ email: 'sender@example.com' }],
  mailboxIds: { inbox: true }, keywords: { $seen: true }, size: 10, hasAttachment: true, receivedAt: '2026-11-01T12:00:00Z',
  textBody: [{ partId: 'text', blobId: 'body', type: 'text/plain', size: 5 }], bodyValues: { text: { value: 'Hello', isTruncated: false, isEncodingProblem: false } },
  attachments: [
    { partId: 'a', blobId: 'blob-a', name: 'first.txt', type: 'text/plain', size: 1 },
    { partId: 'b', blobId: 'blob-b', name: 'second.txt', type: 'text/plain', size: 1 },
  ],
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => 'blob:attachments');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  useSettingsStore.setState({ markAsReadDelay: -1, attachmentImagePreviewsEnabled: false, attachmentPosition: 'below-header' });
  useEmailStore.setState({ isUnifiedView: false, viewingAccountId: null });
  useToastStore.getState().clearToasts();
});

afterEach(() => {
  useAuthStore.setState(initialAuth);
  useEmailStore.setState(initialEmail);
  useSettingsStore.setState(initialSettings);
  useToastStore.getState().clearToasts();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function openViewer() {
  const client = new JMAPClient('https://mail.example', 'user@example.com', 'test');
  const fetchBlob = vi.spyOn(client, 'fetchBlob').mockResolvedValue(new Blob(['content'], { type: 'text/plain' }));
  useAuthStore.setState({ client });
  render(<NextIntlClientProvider locale="en" messages={en}><EmailViewer email={message} /></NextIntlClientProvider>);
  return fetchBlob;
}

describe('reader attachment actions', () => {
  it('warns when a ZIP omits an attachment that failed to download', async () => {
    const fetchBlob = openViewer();
    fetchBlob.mockRejectedValueOnce(new Error('unavailable'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Download all' })[0]);
    await waitFor(() => expect(useToastStore.getState().toasts.some(toast => toast.type === 'warning')).toBe(true));
    expect(useToastStore.getState().toasts[0].title).toContain('1 attachment was omitted');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('reports a failed download when no attachment can be bundled', async () => {
    openViewer().mockRejectedValue(new Error('unavailable'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Download all' })[0]);
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('Failed to download'));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('reports ZIP generation failures and lets the user retry', async () => {
    openViewer();
    vi.spyOn(JSZip.prototype, 'generateAsync').mockRejectedValueOnce(new Error('archive failed'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Download all' })[0]);
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe('Failed to download'));
    expect(screen.getAllByRole('button', { name: 'Download all' })[0]).toBeEnabled();
  });

  it('renames a saved copy without changing the original message attachment', async () => {
    openViewer();
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename first.txt' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename attachment' }), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getAllByText('Renamed.txt').length).toBeGreaterThan(0);
    expect(message.attachments?.[0].name).toBe('first.txt');
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Download all' })[0]); });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
});
