import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';
import LanguagePreference from './LanguagePreference';

beforeEach(() => {
  document.cookie = 'locale=;max-age=0';
  localStorage.clear();
});

describe('LanguagePreference', () => {
  it('switches the app locale and persists the choice', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <LanguagePreference />
      </LocaleProvider>,
    );

    expect(screen.getByText('Idioma')).toBeTruthy();
    expect(screen.getByTestId('language-option-es')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('language-option-en'));

    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByTestId('language-option-en')).toHaveAttribute('aria-pressed', 'true');
    expect(document.cookie).toContain('locale=en');
    expect(localStorage.getItem('locale')).toBe('en');
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
