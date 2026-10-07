import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ detach: vi.fn(), attach: vi.fn() }));
vi.mock('@/services/shell/desktop/generated-profile', () => ({
  attachGeneratedProfileEnhancements: (...args: unknown[]) => { service.attach(...args); return service.detach; },
}));

import { useGeneratedProfileEnhancements } from '@/hooks/shell/login/useGeneratedProfileEnhancements';
import { LocaleProvider } from '@tests/support/intl';

describe('useGeneratedProfileEnhancements', () => {
  it('attaches with the draft callback and detaches on unmount', () => {
    const onDraftChange = vi.fn();
    const { unmount } = renderHook(() => useGeneratedProfileEnhancements(onDraftChange), { wrapper: LocaleProvider });
    expect(service.attach).toHaveBeenCalledWith(expect.any(Function), onDraftChange);
    unmount();
    expect(service.detach).toHaveBeenCalled();
  });

  it('attaches once with no callback, however often it renders', () => {
    service.attach.mockClear();
    const { rerender } = renderHook(() => useGeneratedProfileEnhancements(), { wrapper: LocaleProvider });
    rerender();
    expect(service.attach).toHaveBeenCalledTimes(1);
  });
});
