import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { useHelpPopover } from '@/hooks/shell/panes/topbar/useHelpPopover';
import { useHintsStore } from '@/store/hints';

describe('useHelpPopover', () => {
  it('reads the locale and replays the hints before closing', () => {
    const order: string[] = [];
    useHintsStore.setState({ resetHints: () => order.push('reset') });
    const onClose = vi.fn(() => order.push('close'));
    const { result } = renderHook(() => useHelpPopover(onClose), {
      wrapper: ({ children }) => <LocaleProvider initialLocale="es">{children}</LocaleProvider>,
    });
    expect(result.current.locale).toBe('es');
    result.current.replayHints();
    expect(order).toEqual(['reset', 'close']);
  });
});
