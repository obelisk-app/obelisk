import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamRef } from '@/hooks/useStreamRef';
import { FakeMediaStream } from '@tests/support/mocks/webrtc';

/** Mounts the hook with its ref attached to an element, as the component's JSX would. */
function renderAttached(initial: MediaStream | null) {
  const el = document.createElement('audio');
  const hook = renderHook(({ stream }: { stream: MediaStream | null }) => {
    const ref = useStreamRef<HTMLAudioElement>(stream);
    ref.current = el;
    return ref;
  }, { initialProps: { stream: initial } });
  return { el, ...hook };
}

const asStream = (s: FakeMediaStream) => s as unknown as MediaStream;

describe('useStreamRef', () => {
  let play: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('binds the stream as srcObject and nudges play()', () => {
    const stream = asStream(new FakeMediaStream());
    const { el } = renderAttached(stream);
    expect(el.srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('does not call play() for a null stream, and clears srcObject when the stream goes away', () => {
    const stream = asStream(new FakeMediaStream());
    const { el, rerender } = renderAttached(stream);
    rerender({ stream: null });
    expect(el.srcObject).toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('swallows an autoplay refusal', async () => {
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    const stream = asStream(new FakeMediaStream());
    expect(() => renderAttached(stream)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('does nothing until an element is attached', () => {
    const { result } = renderHook(() => useStreamRef<HTMLVideoElement>(asStream(new FakeMediaStream())));
    expect(result.current.current).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});
