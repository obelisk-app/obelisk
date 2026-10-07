import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import type { Locale } from '@/i18n';
import LanguageToggle from '@/components/marketing/site/LanguageToggle';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
let currentPathname = '/';

// `usePathname` here is next-intl's: the path without the locale prefix.
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, prefetch: vi.fn() }),
}));

function renderToggle(locale: Locale = 'es') {
  return render(
    <LocaleProvider initialLocale={locale}>
      <LanguageToggle />
    </LocaleProvider>,
  );
}

/** Open the picker and choose a language. */
function pick(locale: Locale) {
  fireEvent.click(screen.getByTestId('language-toggle'));
  fireEvent.click(screen.getByTestId(`language-menu-${locale}`));
}

describe('LanguageToggle', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    currentPathname = '/';
    document.cookie = 'locale=;path=/;max-age=0';
  });

  it('shows the language you are reading, not the one you are not', () => {
    // It used to render the *other* language's code, which only works
    // while there are exactly two.
    renderToggle('es');
    expect(screen.getByTestId('language-toggle')).toHaveTextContent('ES');
  });

  it('offers every language the app ships, in its own name', () => {
    renderToggle('es');
    fireEvent.click(screen.getByTestId('language-toggle'));

    const menu = screen.getByTestId('language-menu');
    expect(menu).toHaveTextContent('English');
    expect(menu).toHaveTextContent('Español');
    // Someone looking for Portuguese can't be expected to recognise
    // "Portuguese" in a language they don't read.
    expect(menu).toHaveTextContent('Português');
  });

  it('marks the language you are already reading', () => {
    renderToggle('pt');
    fireEvent.click(screen.getByTestId('language-toggle'));
    expect(screen.getByTestId('language-menu-pt')).toHaveAttribute('aria-current', 'true');
  });

  it('is a menu of radio rows with the current one checked, and Escape closes it', () => {
    renderToggle('es');
    fireEvent.click(screen.getByTestId('language-toggle'));
    expect(screen.getByTestId('language-menu')).toHaveAttribute('role', 'menu');
    expect(screen.getByTestId('language-menu-es')).toHaveAttribute('role', 'menuitemradio');
    expect(screen.getByTestId('language-menu-es')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('language-menu-en')).toHaveAttribute('aria-checked', 'false');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('language-menu')).not.toBeInTheDocument();
  });

  it('the trigger is a typed Button that reads as clickable', () => {
    renderToggle('es');
    const trigger = screen.getByTestId('language-toggle');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveClass('rounded-full', 'text-lc-white', 'focus-visible:ring-2');
  });

  it('goes to the same page in the language that was picked', () => {
    currentPathname = '/app';
    renderToggle('es');
    pick('pt');
    expect(replaceMock).toHaveBeenCalledWith('/app', { locale: 'pt', scroll: false });
  });

  it('closes without changing anything when you pick what you already have', () => {
    renderToggle('es');
    pick('es');
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('language-menu')).not.toBeInTheDocument();
  });

  it('moves you to the same guide in the new language', () => {
    // Guide paths are the same in every language; the router adds the prefix.
    currentPathname = '/guides/what-is-obelisk';
    renderToggle('en');
    pick('pt');
    expect(replaceMock).toHaveBeenCalledWith('/guides/what-is-obelisk', { locale: 'pt', scroll: false });
  });

  it('keeps the query, so the app stays on the same relay and channel', () => {
    currentPathname = '/app';
    window.history.replaceState(null, '', '/es/app?relay=public.obelisk.ar&c=general');
    try {
      renderToggle('es');
      pick('en');
      expect(replaceMock).toHaveBeenCalledWith('/app?relay=public.obelisk.ar&c=general', { locale: 'en', scroll: false });
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
