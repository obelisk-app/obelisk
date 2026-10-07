import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@tests/support/intl';
import LanguagePreference from '@/components/settings/appearance/LanguagePreference';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  usePathname: () => '/app',
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, prefetch: vi.fn() }),
}));

beforeEach(() => {
  replaceMock.mockClear();
});

describe('LanguagePreference', () => {
  it('switches language by going to the same page in it', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <LanguagePreference />
      </LocaleProvider>,
    );

    expect(screen.getByText('Idioma')).toBeTruthy();
    expect(screen.getByTestId('language-option-es')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('language-option-en'));
    expect(replaceMock).toHaveBeenCalledWith('/app', { locale: 'en', scroll: false });
  });

  it('offers Portuguese too', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <LanguagePreference />
      </LocaleProvider>,
    );

    await user.click(screen.getByTestId('language-option-pt'));
    expect(replaceMock).toHaveBeenCalledWith('/app', { locale: 'pt', scroll: false });
  });

  it('does nothing when the language is already the current one', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <LanguagePreference />
      </LocaleProvider>,
    );
    await user.click(screen.getByTestId('language-option-es'));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('renders the compact mobile row', () => {
    render(
      <LocaleProvider initialLocale="en">
        <LanguagePreference variant="mobile" />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('language-preference').className).toContain('settings-row');
    expect(screen.getByTestId('language-option-en')).toHaveAttribute('aria-pressed', 'true');
  });
});
