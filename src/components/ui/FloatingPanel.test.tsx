import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import FloatingPanel from './FloatingPanel';

const rect = (top: number, height: number, left = 900, width = 32) =>
  ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

let anchorTop = 100;
let scrollerBox = rect(0, 700, 0, 1200);

function Host({ onClose, prefer }: { onClose: () => void; prefer?: 'above' | 'below' }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <button ref={anchorRef}>⋯</button>
      <FloatingPanel anchorRef={anchorRef} onClose={onClose} prefer={prefer} testId="panel">
        <div>menu</div>
      </FloatingPanel>
    </div>
  );
}

function setup(onClose = vi.fn(), prefer?: 'above' | 'below') {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName === 'BUTTON') return rect(anchorTop, 32);
    if (this.dataset.testid === 'scroller') return scrollerBox;
    return rect(0, 0);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(256);
  // jsdom has no layout: make the scroller count as scrollable.
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'scroller' ? 5000 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'scroller' ? 700 : 0;
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
  render(<Host onClose={onClose} prefer={prefer} />);
  return onClose;
}

const panel = () => screen.getByTestId('panel');

describe('FloatingPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    anchorTop = 100;
    scrollerBox = rect(0, 700, 0, 1200);
  });

  it('renders in a portal with fixed coordinates below the trigger when it fits', () => {
    setup();
    expect(panel().parentElement).toBe(document.body);
    expect(panel().style.position).toBe('fixed');
    expect(panel().dataset.side).toBe('below');
    expect(panel().style.top).toBe('136px'); // 100 + 32 + 4
    expect(panel().style.left).toBe(`${932 - 256}px`); // right-aligned to the trigger
  });

  it('opens upward when there is no room below', () => {
    anchorTop = 650;
    setup();
    expect(panel().dataset.side).toBe('above');
    expect(panel().style.top).toBe(`${650 - 4 - 300}px`);
  });

  it('follows the trigger on scroll and re-decides the side', () => {
    setup();
    expect(panel().dataset.side).toBe('below');
    anchorTop = 640;
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(panel().dataset.side).toBe('above');
    expect(panel().style.top).toBe(`${640 - 4 - 300}px`);
  });

  it('closes when the trigger scrolls out of its list', () => {
    const onClose = setup();
    scrollerBox = rect(0, 500, 0, 1200);
    anchorTop = 600; // below the list's visible bottom (behind the composer)
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(onClose).toHaveBeenCalled();
  });
});
