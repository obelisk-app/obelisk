import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStagePin } from '@/components/voice/room/useStagePin';

describe('useStagePin', () => {
  it('pins and toggles while joined', () => {
    const { result } = renderHook(({ joined }) => useStagePin(joined), { initialProps: { joined: true } });
    act(() => result.current[1]('a'));
    expect(result.current[0]).toBe('a');
    act(() => result.current[1]((p) => (p === 'a' ? null : 'a')));
    expect(result.current[0]).toBeNull();
  });

  it('drops the pin in the same render that leaves the call, so a rejoin starts unpinned', () => {
    const seen: (string | null)[] = [];
    const { result, rerender } = renderHook(({ joined }) => {
      const pin = useStagePin(joined);
      seen.push(pin[0]);
      return pin;
    }, { initialProps: { joined: true } });
    act(() => result.current[1]('a'));
    seen.length = 0;
    rerender({ joined: false });
    // No committed render ever shows the stale pin after leaving.
    expect(result.current[0]).toBeNull();
    expect(seen.at(-1)).toBeNull();
    rerender({ joined: true });
    expect(result.current[0]).toBeNull();
  });
});
