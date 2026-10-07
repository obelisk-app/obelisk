import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDismiss, type DismissEscape, type DismissOutside } from '@/hooks/common/useDismiss';

function Host({ onDismiss, enabled, outside, escape }: {
  onDismiss: () => void; enabled?: boolean; outside?: DismissOutside; escape?: DismissEscape;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  useDismiss({ refs: [panel, anchor], onDismiss, enabled, outside, escape });
  return (
    <div>
      <button ref={anchor}>anchor</button>
      <div ref={panel}><span>inside</span></div>
      <p>outside</p>
    </div>
  );
}

describe('useDismiss', () => {
  it('dismisses on a press outside and on Escape, not inside the panel or on the anchor', () => {
    const onDismiss = vi.fn();
    render(<Host onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByText('inside'));
    fireEvent.mouseDown(screen.getByText('anchor'));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('pointerdown listens for pointer presses instead of mousedown', () => {
    const onDismiss = vi.fn();
    render(<Host onDismiss={onDismiss} outside="pointerdown" />);
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('outside none and escape ignore switch each half off', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Host onDismiss={onDismiss} outside="none" />);
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(<Host onDismiss={onDismiss} escape="ignore" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled', () => {
    const onDismiss = vi.fn();
    render(<Host onDismiss={onDismiss} enabled={false} />);
    fireEvent.mouseDown(screen.getByText('outside'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('always calls the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Host onDismiss={first} />);
    rerender(<Host onDismiss={second} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
