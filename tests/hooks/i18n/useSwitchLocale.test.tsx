import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { useSwitchLocale } from '@/hooks/i18n/useSwitchLocale';

/**
 * The real next-intl router over a fake Next one: picking a language must
 * navigate to the prefixed URL (English unprefixed) and write the `locale`
 * cookie, which is what makes the choice win over Accept-Language later.
 */
const { nextReplace } = vi.hoisted(() => ({ nextReplace: vi.fn() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: vi.fn(), replace: nextReplace, prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/es/guides/vesta',
}));

const wrap = (locale: 'en' | 'es' | 'pt') =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>;
  };

describe('useSwitchLocale', () => {
  beforeEach(() => {
    nextReplace.mockClear();
    document.cookie = 'locale=;path=/;max-age=0';
  });

  it('goes to the same page under the new prefix and writes the cookie', () => {
    const { result } = renderHook(() => useSwitchLocale(), { wrapper: wrap('es') });
    act(() => result.current('pt'));
    expect(nextReplace).toHaveBeenCalledWith('/pt/guides/vesta', { scroll: false });
    expect(document.cookie).toContain('locale=pt');
  });

  it('switching to English goes through /en, which the proxy turns into the unprefixed URL', () => {
    // next-intl forces the prefix on a language switch so the request
    // names the language even though English URLs are unprefixed; the
    // middleware answers `/en/guides/vesta` with a redirect to `/guides/vesta`.
    const { result } = renderHook(() => useSwitchLocale(), { wrapper: wrap('es') });
    act(() => result.current('en'));
    expect(nextReplace).toHaveBeenCalledWith('/en/guides/vesta', { scroll: false });
    expect(document.cookie).toContain('locale=en');
  });
});
