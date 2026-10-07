import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const push = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { useLandingPage } from '@/hooks/marketing/useLandingPage';

describe('useLandingPage', () => {
  beforeEach(() => push.mockClear());

  it('sends the call to action to the app without a spinner', () => {
    const { result } = renderHook(() => useLandingPage());
    act(() => result.current.launch());
    expect(push).toHaveBeenCalledWith('/app');
    expect(result.current.isNavigating).toBe(false);
  });

  it('shows the spinner while a finished login goes to the app', () => {
    const { result } = renderHook(() => useLandingPage());
    act(() => result.current.onLoginSuccess());
    expect(result.current.isNavigating).toBe(true);
    expect(push).toHaveBeenCalledWith('/app');
  });
});
