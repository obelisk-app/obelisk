import { fireEvent, render, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEscapeKey } from '@/components/chat/hooks/useEscapeKey';
import { useOutsideMouseDown } from '@/components/chat/hooks/useOutsideMouseDown';

describe('useEscapeKey', () => {
  it('fires on Escape only, and only while enabled', () => {
    const onEscape = vi.fn();
    const { rerender, unmount } = renderHook(({ enabled }) => useEscapeKey(onEscape, enabled), {
      initialProps: { enabled: true },
    });
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    unmount();
  });
});

function Harness({ onOutside, enabled, touch = false }: { onOutside: () => void; enabled: boolean; touch?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideMouseDown(ref, onOutside, enabled, touch);
  return (
    <div>
      <div ref={ref} data-testid="inside"><span data-testid="child">x</span></div>
      <div data-testid="outside" />
    </div>
  );
}

describe('useOutsideMouseDown', () => {
  it('fires for a press outside the element, not inside it', () => {
    const onOutside = vi.fn();
    const { getByTestId, rerender } = render(<Harness onOutside={onOutside} enabled />);
    fireEvent.mouseDown(getByTestId('child'));
    expect(onOutside).not.toHaveBeenCalled();
    fireEvent.mouseDown(getByTestId('outside'));
    expect(onOutside).toHaveBeenCalledTimes(1);
    rerender(<Harness onOutside={onOutside} enabled={false} />);
    fireEvent.mouseDown(getByTestId('outside'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('listens for touchstart only when asked', () => {
    const onOutside = vi.fn();
    const { getByTestId, rerender } = render(<Harness onOutside={onOutside} enabled />);
    fireEvent.touchStart(getByTestId('outside'));
    expect(onOutside).not.toHaveBeenCalled();
    rerender(<Harness onOutside={onOutside} enabled touch />);
    fireEvent.touchStart(getByTestId('outside'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
});
