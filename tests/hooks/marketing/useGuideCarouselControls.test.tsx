import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGuideCarouselControls } from '@/hooks/marketing/useGuideCarouselControls';

function Probe() {
  const { atStart, atEnd, page } = useGuideCarouselControls('track');
  return (
    <>
      <div id="track" data-testid="track" />
      <span data-testid="edges">{`${atStart} ${atEnd}`}</span>
      <button type="button" onClick={() => page(1)}>next</button>
    </>
  );
}

/** jsdom has no layout: give the track a width, a content width and a scroll position. */
function shape(el: HTMLElement, { left, client, scroll }: { left: number; client: number; scroll: number }) {
  Object.defineProperty(el, 'scrollLeft', { configurable: true, value: left });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: client });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scroll });
}

describe('useGuideCarouselControls', () => {
  afterEach(() => vi.useRealTimers());

  it('measures the ends on the first frame and on every scroll', async () => {
    render(<Probe />);
    const track = screen.getByTestId('track');
    shape(track, { left: 0, client: 300, scroll: 1000 });
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    expect(screen.getByTestId('edges').textContent).toBe('true false');

    shape(track, { left: 698, client: 300, scroll: 1000 });
    fireEvent.scroll(track);
    expect(screen.getByTestId('edges').textContent).toBe('false true');
  });

  it('pages by most of the track width', () => {
    render(<Probe />);
    const track = screen.getByTestId('track');
    shape(track, { left: 0, client: 400, scroll: 1200 });
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    fireEvent.click(screen.getByText('next'));
    expect(scrollBy).toHaveBeenCalledWith({ left: 340, behavior: 'smooth' });
  });
});
