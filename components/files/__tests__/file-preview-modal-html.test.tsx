import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilePreviewModal } from '../file-preview-modal';
import { useSettingsStore } from '@/stores/settings-store';

const originalPolicy = useSettingsStore.getState().externalContentPolicy;

afterEach(() => {
  useSettingsStore.setState({ externalContentPolicy: originalPolicy });
  vi.unstubAllGlobals();
});

describe('HTML attachment preview', () => {
  it('renders a cleaned document without exposing the original bytes as a blob URL', async () => {
    useSettingsStore.setState({ externalContentPolicy: 'block' });
    const createObjectURL = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
    });
    const html = '<script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://tracker.example"><img src="https://tracker.example/pixel" onerror="alert(2)"><p>Hello</p>';
    render(<FilePreviewModal name="report.html" onClose={vi.fn()} onDownload={vi.fn()}
      getFileContent={async () => ({ blob: new Blob([html], { type: 'text/html' }), contentType: 'text/html' })} />);

    const frame = await screen.findByTitle('report.html');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).not.toHaveAttribute('src');
    const source = frame.getAttribute('srcdoc') || '';
    expect(source).toContain('<p>Hello</p>');
    expect(source).not.toMatch(/<script|onerror|http-equiv="refresh"/);
    expect(new DOMParser().parseFromString(source, 'text/html').querySelector('img')?.getAttribute('src')).not.toMatch(/^https:/);
    expect(source).toContain("default-src 'none'");
    expect(source).toContain("img-src data: blob:;");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByTitle('open_in_new_tab')).not.toBeInTheDocument();
  });

  it('honours remote content settings without allowing scripts', async () => {
    useSettingsStore.setState({ externalContentPolicy: 'allow' });
    const getFileContent = async () => ({
      blob: new Blob(['<img src="https://images.example/photo.png"><script>alert(1)</script>'], { type: 'text/html' }),
      contentType: 'text/html',
    });
    render(<FilePreviewModal name="photo.htm" onClose={vi.fn()} onDownload={vi.fn()} getFileContent={getFileContent} />);
    const frame = await screen.findByTitle('photo.htm');
    expect(frame.getAttribute('srcdoc')).toContain('https://images.example/photo.png');
    expect(frame.getAttribute('srcdoc')).not.toContain('<script');

    act(() => useSettingsStore.setState({ externalContentPolicy: 'block' }));
    await waitFor(() => {
      const source = screen.getByTitle('photo.htm').getAttribute('srcdoc') || '';
      expect(new DOMParser().parseFromString(source, 'text/html').querySelector('img')?.getAttribute('src')).not.toMatch(/^https:/);
    });
  });
});
