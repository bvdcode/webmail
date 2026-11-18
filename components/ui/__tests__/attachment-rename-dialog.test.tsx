import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAttachmentRename } from '@/hooks/use-attachment-rename';
import { PromptDialog } from '../prompt-dialog';

function RenameExample({ onRename }: { onRename: (id: string, name: string) => void }) {
  const rename = useAttachmentRename(onRename);
  return <><button onClick={() => rename.rename('attachment', 'report.pdf')}>Open</button><PromptDialog {...rename.dialogProps} /></>;
}

describe('attachment rename dialog', () => {
  it('edits only the stem, trims the value and preserves the extension', () => {
    const onRename = vi.fn();
    render(<RenameExample onRename={onRename} />);
    fireEvent.click(screen.getByText('Open'));
    const input = screen.getByRole('textbox', { name: 'rename_title' });
    expect(input).toHaveValue('report');
    expect(screen.getByText('.pdf')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '  Отчёт  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'rename' }));
    expect(onRename).toHaveBeenCalledWith('attachment', 'Отчёт.pdf');
  });

  it('keeps invalid input open and does not submit it', () => {
    const onRename = vi.fn();
    render(<RenameExample onRename={onRename} />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '../file' } });
    expect(screen.getByRole('alert')).toHaveTextContent('rename_invalid_chars');
    expect(screen.getByRole('button', { name: 'rename' })).toBeDisabled();
    expect(onRename).not.toHaveBeenCalled();
  });
});
