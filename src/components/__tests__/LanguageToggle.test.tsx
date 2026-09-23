import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import type { Locale } from '@/i18n';
import LanguageToggle from '../LanguageToggle';

const pushMock = vi.fn();
let currentPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
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
    pushMock.mockClear();
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

  it('switches to the language that was picked', () => {
    renderToggle('es');
    pick('pt');
    expect(document.cookie).toContain('locale=pt');
  });

  it('closes without changing anything when you pick what you already have', () => {
    renderToggle('es');
    pick('es');
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('language-menu')).not.toBeInTheDocument();
  });

  it('moves you to the same guide in the new language', () => {
    // English articles are unprefixed; every other language is
    // /guides/<locale>.
    currentPathname = '/guides/what-is-obelisk';
    renderToggle('en');
    pick('pt');
    expect(pushMock).toHaveBeenCalledWith('/guides/pt/what-is-obelisk');
  });

  it('moves you back to the English article', () => {
    currentPathname = '/guides/pt/what-is-obelisk';
    renderToggle('pt');
    pick('en');
    expect(pushMock).toHaveBeenCalledWith('/guides/what-is-obelisk');
  });

  it('switches between two non-English guide languages', () => {
    // The old regex only knew about /guides/es, so this pathname was
    // unrecognised and the URL was left pointing at the wrong language.
    currentPathname = '/guides/es/what-is-obelisk';
    renderToggle('es');
    pick('pt');
    expect(pushMock).toHaveBeenCalledWith('/guides/pt/what-is-obelisk');
  });

  it('rewrites the guides index too', () => {
    currentPathname = '/guides/es';
    renderToggle('es');
    pick('pt');
    expect(pushMock).toHaveBeenCalledWith('/guides/pt');
  });

  it('leaves other pages where they are', () => {
    currentPathname = '/app';
    renderToggle('es');
    pick('en');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
