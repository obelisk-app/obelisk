import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import MentionNavigator from './MentionNavigator';

// CSS.escape exists in jsdom but make sure
beforeEach(() => {
  if (typeof CSS === 'undefined' || !CSS.escape) {
    (globalThis as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
  }
});

function Harness({ eventIds }: { eventIds: ReadonlyArray<string> }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ height: 200, overflow: 'auto' }}>
      {eventIds.map((id) => (
        <div key={id} data-msg-id={id} style={{ height: 60 }}>
          msg {id}
        </div>
      ))}
      <MentionNavigator scrollRef={ref} eventIds={eventIds} />
    </div>
  );
}

describe('MentionNavigator', () => {
  it('renders nothing when there are no highlights and user is at the bottom', () => {
    render(<Harness eventIds={[]} />);
    expect(screen.queryByLabelText(/Mention navigation/i)).toBeNull();
    // Jump-to-latest also hidden because we haven't scrolled.
    expect(screen.queryByLabelText(/Jump to latest message/i)).toBeNull();
  });

  it('renders the count widget when highlights exist', () => {
    render(<Harness eventIds={['a', 'b', 'c']} />);
    expect(screen.getByLabelText(/Mention navigation/i)).toBeInTheDocument();
    // Format: "1 / 3 mentions"
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/mentions/)).toBeInTheDocument();
  });

  it('disables prev at the start and next at the end', () => {
    render(<Harness eventIds={['a', 'b']} />);
    const prev = screen.getByLabelText(/Previous mention/i) as HTMLButtonElement;
    const next = screen.getByLabelText(/Next mention/i) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('clicking next advances and calls scrollIntoView on the next id', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    try {
      render(<Harness eventIds={['a', 'b', 'c']} />);
      fireEvent.click(screen.getByLabelText(/Next mention/i));
      expect(spy).toHaveBeenCalled();
      // Index should have advanced from 1/3 to 2/3.
      expect(screen.getByText('2')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('F7 advances, Shift+F7 goes back (Discord parity)', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    try {
      const { container } = render(<Harness eventIds={['a', 'b', 'c']} />);
      const positionEl = () => container.querySelector('.text-lc-green')?.textContent;
      expect(positionEl()).toBe('1');
      fireEvent.keyDown(window, { key: 'F7' });
      expect(positionEl()).toBe('2');
      fireEvent.keyDown(window, { key: 'F7' });
      expect(positionEl()).toBe('3');
      fireEvent.keyDown(window, { key: 'F7', shiftKey: true });
      expect(positionEl()).toBe('2');
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not hijack F7 when focused inside an input', () => {
    render(
      <>
        <input data-testid="composer" />
        <Harness eventIds={['a', 'b']} />
      </>,
    );
    const inp = screen.getByTestId('composer');
    inp.focus();
    fireEvent.keyDown(inp, { key: 'F7' });
    // Index unchanged at 1.
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('clamps the index when eventIds shrinks (e.g. user acked one)', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    try {
      const { container, rerender } = render(<Harness eventIds={['a', 'b', 'c']} />);
      const positionEl = () => container.querySelector('.text-lc-green')?.textContent;
      fireEvent.click(screen.getByLabelText(/Next mention/i));
      fireEvent.click(screen.getByLabelText(/Next mention/i));
      expect(positionEl()).toBe('3');
      // Now shrink the list — pointer should clamp to within bounds.
      rerender(<Harness eventIds={['a']} />);
      expect(positionEl()).toBe('1');
    } finally {
      spy.mockRestore();
    }
  });
});
