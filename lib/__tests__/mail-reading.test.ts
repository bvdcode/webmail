import { describe, expect, it } from 'vitest';
import { mailReadingClass, mailReadingCss } from '../mail-reading';
import { useSettingsStore } from '@/stores/settings-store';

describe('mail reading preferences', () => {
  it('keeps the current layout as the default', () => {
    expect(useSettingsStore.getInitialState().readingWidth).toBe('full');
    expect(useSettingsStore.getInitialState().mailFitWidth).toBe(false);
    expect(mailReadingClass('full')).toBe('');
    expect(mailReadingCss('full')).toBe('');
  });

  it('limits HTML and plain text to the same centred comfortable width', () => {
    expect(mailReadingCss('comfortable')).toContain('max-width:80ch!important');
    expect(mailReadingCss('comfortable')).toContain('margin-inline:auto!important');
    expect(mailReadingClass('comfortable')).toBe('max-w-[80ch] mx-auto');
  });
});
