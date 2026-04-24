import { render, fireEvent, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useRef } from 'react';
import { useClickOutside } from './useClickOutside';

function Harness({
  onOutside,
  escape = false,
  enabled = true,
}: {
  onOutside: () => void;
  escape?: boolean;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onOutside, { escape, enabled });
  return (
    <div>
      <div ref={ref} data-testid="inside">
        <button data-testid="nested">nested</button>
      </div>
      <button data-testid="outside">outside</button>
    </div>
  );
}

describe('useClickOutside', () => {
  it('calls handler when mousedown is outside the ref', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} />);
    fireEvent.mouseDown(getByTestId('outside'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when mousedown is inside the ref', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} />);
    fireEvent.mouseDown(getByTestId('inside'));
    fireEvent.mouseDown(getByTestId('nested'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores Escape by default', () => {
    const handler = vi.fn();
    render(<Harness onOutside={handler} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls handler on Escape when escape: true', () => {
    const handler = vi.fn();
    render(<Harness onOutside={handler} escape />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores non-Escape keys even when escape: true', () => {
    const handler = vi.fn();
    render(<Harness onOutside={handler} escape />);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('detaches listeners when enabled: false', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness onOutside={handler} enabled={false} escape />);
    fireEvent.mouseDown(getByTestId('outside'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('cleans up listeners on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useClickOutside(ref, handler, { escape: true });
    });
    unmount();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handler).not.toHaveBeenCalled();
  });
});
