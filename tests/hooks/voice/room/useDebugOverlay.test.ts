import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebugOverlay, VOICE_DEBUG_REFRESH_MS } from '@/hooks/voice/room/useDebugOverlay';
import { clearVoiceDebug, pushVoiceDebug } from '@/services/voice/debug';

afterEach(() => { vi.useRealTimers(); clearVoiceDebug(); });

describe('useDebugOverlay', () => {
  it('re-reads the debug bag on every tick', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebugOverlay());
    expect(result.current.tick).toBe(0);
    pushVoiceDebug({ kind: 'relay-error', payload: 'x' });
    act(() => { vi.advanceTimersByTime(VOICE_DEBUG_REFRESH_MS); });
    expect(result.current.tick).toBe(1);
    expect(result.current.events[0]?.kind).toBe('relay-error');
  });
});
