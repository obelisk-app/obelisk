import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStageArea, type StageAreaInput } from '@/hooks/voice/room/useStageArea';

const input = (over: Partial<StageAreaInput> = {}): StageAreaInput => ({
  activeStage: null,
  pinned: null,
  setPinned: vi.fn(),
  videoPubkeys: ['me', 'a'],
  audioPubkeys: ['b'],
  selfPubkey: 'me',
  localCamStream: { id: 'local' } as unknown as MediaStream,
  tracksByPubkey: new Map(),
  ...over,
});

describe('useStageArea', () => {
  it('knows who is me and whose stream each tile shows', () => {
    const { result } = renderHook(() => useStageArea(input()));
    expect(result.current.isSelf('me')).toBe(true);
    expect(result.current.isSelf('a')).toBe(false);
    expect(result.current.streamFor('me')).toEqual({ id: 'local' });
    expect(result.current.streamFor('a')).toBeNull();
  });

  it('pins, and toggles a pin', () => {
    const setPinned = vi.fn();
    const { result } = renderHook(() => useStageArea(input({ setPinned })));
    result.current.pin('a');
    expect(setPinned).toHaveBeenLastCalledWith('a');
    result.current.togglePin('a');
    const updater = setPinned.mock.calls.at(-1)![0] as (p: string | null) => string | null;
    expect(updater('a')).toBeNull();
    expect(updater('b')).toBe('a');
  });

  it('puts audio-only people under the cameras, or in a grid when nobody has a camera', () => {
    expect(renderHook(() => useStageArea(input())).result.current).toMatchObject({ audioAsChips: true, audioAsGrid: false });
    const noCams = renderHook(() => useStageArea(input({ videoPubkeys: [] }))).result.current;
    expect(noCams).toMatchObject({ audioAsChips: false, audioAsGrid: true, audioGridClass: 'grid-cols-1' });
  });
});
