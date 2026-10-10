import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect, useRef } from 'react';
import { clearChannelScrollPositions, rememberChannelScrollPosition } from '@/utils/chat/timeline/channel-scroll-position';
import { useChannelScrollPosition } from '@/hooks/chat/timeline/useChannelScrollPosition';

function defineScrollMetrics(el: HTMLDivElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

function Harness({
  scrollKey,
  itemCount,
  disabled = false,
  scrollHeight = 1000,
  initialAnchorOffset,
  onNearBottomChange,
  ignoreSavedOnInitialRestore = false,
}: {
  scrollKey: string;
  itemCount: number;
  disabled?: boolean;
  scrollHeight?: number;
  initialAnchorOffset?: number;
  onNearBottomChange?: (nearBottom: boolean) => void;
  ignoreSavedOnInitialRestore?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current) defineScrollMetrics(ref.current, scrollHeight, 200);
  }, [scrollHeight]);
  useChannelScrollPosition({
    scrollKey,
    scrollRef: ref,
    itemCount,
    disabled,
    initialAnchorKey: initialAnchorOffset == null ? null : `anchor-${initialAnchorOffset}`,
    ignoreSavedOnInitialRestore,
    getInitialAnchorElement: initialAnchorOffset == null
      ? undefined
      : () => ({ offsetTop: initialAnchorOffset }) as HTMLElement,
    onNearBottomChange,
  });
  return (
    <div
      data-testid="scroller"
      ref={(node) => {
        if (node) defineScrollMetrics(node, scrollHeight, 200);
        ref.current = node;
      }}
    >
      {Array.from({ length: itemCount }, (_, i) => <div key={i} data-row={i} />)}
    </div>
  );
}

describe('useChannelScrollPosition', () => {
  let resize: ResizeObserverCallback;

  beforeEach(() => {
    clearChannelScrollPositions();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    });
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

  it('ignores a stale saved position when the channel is already read through latest', () => {
    rememberChannelScrollPosition('relay::g1', { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 });

    render(<Harness scrollKey="relay::g1" itemCount={5} ignoreSavedOnInitialRestore />);

    expect((screen.getByTestId('scroller') as HTMLDivElement).scrollTop).toBe(800);
  });

  it('uses a read-cursor anchor on first open when no saved position exists', () => {
    render(<Harness scrollKey="relay::g1" itemCount={5} initialAnchorOffset={360} />);

    expect((screen.getByTestId('scroller') as HTMLDivElement).scrollTop).toBe(360);
  });

  it('lets the read cursor override an old saved position on channel entry', () => {
    rememberChannelScrollPosition('relay::g1', { scrollTop: 120, scrollHeight: 1000, clientHeight: 200 });

    render(
      <Harness
        scrollKey="relay::g1"
        itemCount={5}
        initialAnchorOffset={360}
        ignoreSavedOnInitialRestore
      />,
    );

    expect((screen.getByTestId('scroller') as HTMLDivElement).scrollTop).toBe(360);
  });

  it('does not run passive restore after an explicit message jump takes over', () => {
    rememberChannelScrollPosition('relay::g1', { scrollTop: 300, scrollHeight: 1000, clientHeight: 200 });
    const { rerender } = render(<Harness scrollKey="relay::g1" itemCount={5} disabled />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    expect(el.scrollTop).toBe(0);

    rerender(<Harness scrollKey="relay::g1" itemCount={5} disabled={false} />);

    expect(el.scrollTop).toBe(0);
  });

  it('keeps a first-open channel bottom-locked while the initial latest messages fill in', () => {
    const { rerender } = render(<Harness scrollKey="relay::g1" itemCount={1} scrollHeight={200} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    expect(el.scrollTop).toBe(0);

    rerender(<Harness scrollKey="relay::g1" itemCount={8} scrollHeight={1000} />);

    expect(el.scrollTop).toBe(800);
  });

  it('stays bottom-locked when the PWA message area finishes laying out', () => {
    render(<Harness scrollKey="relay::g1" itemCount={5} scrollHeight={200} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    defineScrollMetrics(el, 1000, 200);
    act(() => resize([], {} as ResizeObserver));

    expect(el.scrollTop).toBe(800);
  });

  it('keeps retrying a saved mid-history restore until enough mobile history is rendered', () => {
    rememberChannelScrollPosition('relay::g1', { scrollTop: 640, scrollHeight: 1200, clientHeight: 200 });
    const { rerender } = render(<Harness scrollKey="relay::g1" itemCount={0} scrollHeight={200} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;

    expect(el.scrollTop).toBe(0);

    rerender(<Harness scrollKey="relay::g1" itemCount={8} scrollHeight={1000} />);

    expect(el.scrollTop).toBe(640);
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

  it.each([100, 1000, 5000])('tracks an appended row without re-observing %i existing rows', async (count) => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const unobserve = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    });
    const { rerender, unmount } = render(<Harness scrollKey="relay::large" itemCount={count} />);
    expect(observe).toHaveBeenCalledTimes(count + 1);
    observe.mockClear();

    await act(async () => {
      rerender(<Harness scrollKey="relay::large" itemCount={count + 1} scrollHeight={1200} />);
    });
    expect(disconnect).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0][0]).toHaveAttribute('data-row', String(count));

    await act(async () => {
      rerender(<Harness scrollKey="relay::large" itemCount={count} scrollHeight={1000} />);
    });
    expect(unobserve).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('preserves mid-history reading when a row resizes, but follows media growth at the bottom', () => {
    render(<Harness scrollKey="relay::g1" itemCount={5} />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;
    defineScrollMetrics(el, 1200, 200);
    act(() => resize([], {} as ResizeObserver));
    expect(el.scrollTop).toBe(1000);

    act(() => { el.scrollTop = 300; fireEvent.scroll(el); });
    defineScrollMetrics(el, 1400, 200);
    act(() => resize([], {} as ResizeObserver));
    expect(el.scrollTop).toBe(300);
  });


  it('uses the current anchor when media grows after the initial restore', () => {
    const { rerender } = render(<Harness scrollKey="relay::g1" itemCount={5} initialAnchorOffset={800} ignoreSavedOnInitialRestore />);
    const el = screen.getByTestId('scroller') as HTMLDivElement;
    rerender(<Harness scrollKey="relay::g1" itemCount={5} initialAnchorOffset={950} ignoreSavedOnInitialRestore />);
    defineScrollMetrics(el, 1300, 200);
    act(() => resize([], {} as ResizeObserver));
    expect(el.scrollTop).toBe(950);
  });

  it('disconnects resize tracking for explicit jumps and empty histories', () => {
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect = disconnect;
    });
    const { rerender, unmount } = render(<Harness scrollKey="relay::g1" itemCount={5} />);
    rerender(<Harness scrollKey="relay::g1" itemCount={5} disabled />);
    expect(disconnect).toHaveBeenCalledTimes(1);
    rerender(<Harness scrollKey="relay::g1" itemCount={5} />);
    rerender(<Harness scrollKey="relay::g1" itemCount={0} />);
    expect(disconnect).toHaveBeenCalledTimes(2);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

});
