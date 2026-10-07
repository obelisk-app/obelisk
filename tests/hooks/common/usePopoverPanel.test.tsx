import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePopoverPanel } from '@/hooks/common/usePopoverPanel';

function options(open: boolean, externalRef = createRef<HTMLDivElement>()) {
  return {
    anchorRef: createRef<HTMLElement>(),
    onClose: vi.fn(),
    open,
    follow: 'track' as const,
    prefer: 'below' as const,
    align: 'end' as const,
    dismissOutside: true,
    externalRef,
  };
}

describe('usePopoverPanel', () => {
  it('points the host ref at the panel while open and clears it when closed or unmounted', () => {
    const externalRef = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
    const { result, rerender, unmount } = renderHook((props) => usePopoverPanel(props), { initialProps: options(true, externalRef) });
    expect(result.current.panelRef.current).toBeNull();
    const panel = document.createElement('div');
    result.current.panelRef.current = panel;
    rerender(options(false, externalRef));
    expect(externalRef.current).toBeNull();
    rerender(options(true, externalRef));
    expect(externalRef.current).toBe(panel);
    unmount();
    expect(externalRef.current).toBeNull();
  });

  it('has no position before the panel is measured', () => {
    const { result } = renderHook(() => usePopoverPanel(options(false)));
    expect(result.current.pos).toBeNull();
  });
});
