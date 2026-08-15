import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../use-keyboard-shortcuts';

function renderShortcuts(onFocusSearch: () => void) {
  return renderHook(() => useKeyboardShortcuts({
    emails: [],
    handlers: { onFocusSearch },
  }));
}

function dispatchShortcut(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'KeyF',
    key: 'f',
    ...init,
  });
  act(() => window.dispatchEvent(event));
  return event;
}

describe('useKeyboardShortcuts mail search', () => {
  it('focuses mail search for Ctrl+F', () => {
    const onFocusSearch = vi.fn();
    renderShortcuts(onFocusSearch);

    const event = dispatchShortcut({ ctrlKey: true });

    expect(onFocusSearch).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('focuses mail search for Cmd+F', () => {
    const onFocusSearch = vi.fn();
    renderShortcuts(onFocusSearch);

    const event = dispatchShortcut({ metaKey: true });

    expect(onFocusSearch).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Ctrl+F alone while the user is editing text', () => {
    const onFocusSearch = vi.fn();
    renderShortcuts(onFocusSearch);
    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyF',
      key: 'f',
      ctrlKey: true,
    });
    act(() => input.dispatchEvent(event));
    input.remove();

    expect(onFocusSearch).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
