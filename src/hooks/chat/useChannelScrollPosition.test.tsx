import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { clearChannelScrollPositions, rememberChannelScrollPosition } from '@/lib/channel-scroll-position';
import { useChannelScrollPosition } from './useChannelScrollPosition';

function defineScrollMetrics(el: HTMLDivElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

function Harness({
  scrollKey,
  itemCount,
  disabled = false,
  onNearBottomChange,
}: {
  scrollKey: string;
  itemCount: number;
  disabled?: boolean;
  onNearBottomChange?: (nearBottom: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useChannelScrollPosition({
    scrollKey,
    scrollRef: ref,
    itemCount,
    disabled,
    onNearBottomChange,
  });
  return (
    <div
      data-testid="scroller"
      ref={(node) => {
        if (node) defineScrollMetrics(node, 1000, 200);
        ref.current = node;
      }}
    />
  );
}

describe('useChannelScrollPosition', () => {
  beforeEach(() => {
    clearChannelScrollPositions();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('places a first-open channel at the bottom once messages exist', () => {
    render(<Harness scrollKey="relay::g1" itemCount={5} />);

    expect((screen.getByTestId('scroller') as HTMLDivElement).scrollTop).toBe(800);
  });

  it('remembers and restores a channel position across key changes', () => {
    const { rerender } = render(<Harness scrollKey="relay::g1" itemCount={5} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    act(() => {
      el.scrollTop = 320;
      fireEvent.scroll(el);
    });

    rerender(<Harness scrollKey="relay::g2" itemCount={5} />);
    expect(el.scrollTop).toBe(800);

    rerender(<Harness scrollKey="relay::g1" itemCount={5} />);
    expect(el.scrollTop).toBe(320);
  });

  it('does not run passive restore after an explicit message jump takes over', () => {
    rememberChannelScrollPosition('relay::g1', { scrollTop: 300, scrollHeight: 1000, clientHeight: 200 });
    const { rerender } = render(<Harness scrollKey="relay::g1" itemCount={5} disabled />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    expect(el.scrollTop).toBe(0);

    rerender(<Harness scrollKey="relay::g1" itemCount={5} disabled={false} />);

    expect(el.scrollTop).toBe(0);
  });

  it('reports near-bottom changes from restored and user-driven positions', () => {
    const onNearBottomChange = vi.fn();
    render(<Harness scrollKey="relay::g1" itemCount={5} onNearBottomChange={onNearBottomChange} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    expect(onNearBottomChange).toHaveBeenLastCalledWith(true);

    act(() => {
      el.scrollTop = 200;
      fireEvent.scroll(el);
    });

    expect(onNearBottomChange).toHaveBeenLastCalledWith(false);
  });
});
