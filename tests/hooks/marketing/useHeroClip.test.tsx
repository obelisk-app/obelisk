import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeroClip } from '@/hooks/marketing/useHeroClip';

let onIntersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class FakeIntersectionObserver {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    onIntersect = cb;
  }
  observe = observe;
  disconnect = disconnect;
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduce })));
}

function Probe() {
  const { ref, playing: on } = useHeroClip();
  return <video ref={ref} data-testid="clip" data-playing={on ? 'true' : 'false'} />;
}

const playing = () => screen.getByTestId('clip').dataset.playing;

describe('useHeroClip', () => {
  let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let pause: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    onIntersect = null;
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    play = vi.fn<() => Promise<void>>(() => Promise.resolve());
    pause = vi.fn<() => void>();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    observe.mockClear();
    disconnect.mockClear();
  });

  it('plays while on screen, pauses off screen and reports playing once the first frame runs', async () => {
    stubReducedMotion(false);
    const { unmount } = render(<Probe />);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(playing()).toBe('false');

    await act(async () => onIntersect?.([{ isIntersecting: true }]));
    expect(play).toHaveBeenCalledTimes(1);
    expect(playing()).toBe('true');

    act(() => onIntersect?.([{ isIntersecting: false }]));
    expect(pause).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('never plays for a visitor who asked for reduced motion', () => {
    stubReducedMotion(true);
    render(<Probe />);
    expect(observe).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(playing()).toBe('false');
  });

  it('keeps the poster when the browser refuses to autoplay', async () => {
    stubReducedMotion(false);
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    render(<Probe />);
    await act(async () => onIntersect?.([{ isIntersecting: true }]));
    expect(playing()).toBe('false');
  });
});
