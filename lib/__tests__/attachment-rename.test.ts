import { describe, expect, it } from 'vitest';
import { attachmentNameProblem, splitAttachmentName } from '../attachment-rename';

describe('attachment names', () => {
  it.each([
    ['report.pdf', 'report', '.pdf'], ['archive.tar.gz', 'archive.tar', '.gz'],
    ['README', 'README', ''], ['.profile', '.profile', ''], ['name.', 'name.', ''],
  ])('keeps the extension of %s separate', (name, stem, extension) => {
    expect(splitAttachmentName(name)).toEqual([stem, extension]);
  });

  it.each(['../report', 'folder/file.pdf', 'folder\\file.pdf', 'name\u0000.pdf', 'name\u007f.pdf'])('rejects unsafe name %s', name => {
    expect(attachmentNameProblem(name)).toBe('rename_invalid_chars');
  });

  it('counts the extension and multi-byte characters against the byte limit', () => {
    expect(attachmentNameProblem('a'.repeat(251) + '.pdf')).toBeNull();
    expect(attachmentNameProblem('a'.repeat(252) + '.pdf')).toBe('rename_too_long');
    expect(attachmentNameProblem('я'.repeat(126) + '.pdf')).toBe('rename_too_long');
    expect(attachmentNameProblem('Отчёт.pdf')).toBeNull();
  });
});
