import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { useVoiceRoomForm } from '@/hooks/voice/join/useVoiceRoomForm';

const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent & { preventDefault: ReturnType<typeof vi.fn> };

beforeEach(() => push.mockClear());

describe('useVoiceRoomForm', () => {
  it('starts on the test room and opens the trimmed, encoded name', () => {
    const { result } = renderHook(() => useVoiceRoomForm());
    expect(result.current.room).toBe('test');
    act(() => result.current.setRoom('  team call '));
    const e = submitEvent();
    act(() => result.current.submit(e));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/voice/team%20call');
  });

  it('does nothing for a blank name', () => {
    const { result } = renderHook(() => useVoiceRoomForm());
    act(() => result.current.setRoom('   '));
    act(() => result.current.submit(submitEvent()));
    expect(push).not.toHaveBeenCalled();
  });
});
