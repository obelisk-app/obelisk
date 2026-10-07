import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const push = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { useProfileViewer } from '@/hooks/social/viewer/useProfileViewer';

let matches = false;
let listeners: Array<() => void> = [];

beforeEach(() => {
  push.mockClear();
  matches = false;
  listeners = [];
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return matches; },
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => { listeners = listeners.filter((l) => l !== cb); },
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('useProfileViewer', () => {
  it('follows the phone breakpoint', () => {
    const { result } = renderHook(() => useProfileViewer());
    expect(result.current.mobile).toBe(false);
    act(() => {
      matches = true;
      listeners.forEach((l) => l());
    });
    expect(result.current.mobile).toBe(true);
  });

  it('closes to the app and opens another person by npub', () => {
    const { result } = renderHook(() => useProfileViewer());
    result.current.close();
    expect(push).toHaveBeenCalledWith('/app');
    result.current.openProfile('f'.repeat(64));
    expect(push).toHaveBeenCalledWith(`/p/${nip19.npubEncode('f'.repeat(64))}`);
  });
});
