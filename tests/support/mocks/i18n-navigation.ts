import { createElement, type AnchorHTMLAttributes } from 'react';

/**
 * A stand-in for `@/i18n/navigation` (next-intl's locale-aware `Link` and
 * router) in component tests that want to watch navigation:
 *
 *   vi.mock('@/i18n/navigation', async () =>
 *     (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push }) }));
 *
 * `Link` renders a plain anchor with the locale-free href the code wrote
 * (the tests run in English, where the two are the same).
 */
type Href = string | { pathname: string; query?: Record<string, string> };

const noop = () => {};

export function navigationMock(overrides: { useRouter?: () => unknown; usePathname?: () => string } = {}) {
  const hrefOf = (href: Href) => (typeof href === 'string' ? href : href.pathname);
  return {
    Link: ({ href, locale: _locale, prefetch: _prefetch, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: Href; locale?: string; prefetch?: boolean }) =>
      createElement('a', { href: hrefOf(href), ...rest }),
    useRouter: overrides.useRouter ?? (() => ({ push: noop, replace: noop, prefetch: noop, back: noop, forward: noop, refresh: noop })),
    usePathname: overrides.usePathname ?? (() => '/'),
    redirect: noop,
    permanentRedirect: noop,
    getPathname: ({ href }: { href: Href }) => hrefOf(href),
  };
}
