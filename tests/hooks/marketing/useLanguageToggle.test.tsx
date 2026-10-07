import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const replace = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  usePathname: () => '/guides/vesta',
}));

import { useLanguageToggle } from '@/hooks/marketing/useLanguageToggle';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="es">{children}</LocaleProvider>;

describe('useLanguageToggle', () => {
  beforeEach(() => replace.mockClear());

  it('reads the page language and opens and closes the menu', () => {
    const { result } = renderHook(() => useLanguageToggle(), { wrapper });
    expect(result.current.locale).toBe('es');
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it('picking a language closes the menu and goes to the same page in it', () => {
    const { result } = renderHook(() => useLanguageToggle(), { wrapper });
    act(() => result.current.toggle());
    act(() => result.current.pick('pt'));
    expect(result.current.open).toBe(false);
    expect(replace).toHaveBeenCalledWith('/guides/vesta', { locale: 'pt', scroll: false });
  });

  it('picking the current language only closes the menu', () => {
    const { result } = renderHook(() => useLanguageToggle(), { wrapper });
    act(() => result.current.toggle());
    act(() => result.current.pick('es'));
    expect(result.current.open).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
