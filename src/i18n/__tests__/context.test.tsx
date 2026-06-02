import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider, useTranslation } from '../context';
import { useLocaleStore } from '@/store/locale';

function TestComponent() {
  const { locale, setLocale, t } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="translated">{t('hero.title')}</span>
      <button onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}>toggle</button>
    </div>
  );
}

describe('LocaleProvider + useTranslation', () => {
  beforeEach(() => {
    document.cookie = 'locale=;max-age=0';
    localStorage.clear();
    useLocaleStore.setState({ locale: 'es' });
  });

  it('renders with initial locale from prop', () => {
    render(
      <LocaleProvider initialLocale="en">
        <TestComponent />
      </LocaleProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('translated').textContent).toBe('Tus comunidades,');
  });

  it('uses a stored locale when no initial prop is provided', () => {
    localStorage.setItem('locale', 'en');

    render(
      <LocaleProvider>
        <TestComponent />
      </LocaleProvider>
    );

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('translated').textContent).toBe('Tus comunidades,');
  });

  it('uses the browser language when there is no cookie or stored locale', () => {
    const languageSpy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-AR');
    const languagesSpy = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-AR', 'en-US']);

    render(
      <LocaleProvider>
        <TestComponent />
      </LocaleProvider>
    );

    expect(screen.getByTestId('locale').textContent).toBe('es');
    expect(screen.getByTestId('translated').textContent).toBe('Tus comunidades,');

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it('switches locale on setLocale', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <TestComponent />
      </LocaleProvider>
    );

    expect(screen.getByTestId('translated').textContent).toBe('Tus comunidades,');

    await user.click(screen.getByText('toggle'));

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('translated').textContent).toBe('Tus comunidades,');
  });

  it('syncs the legacy locale store when locale changes', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <TestComponent />
      </LocaleProvider>
    );

    await user.click(screen.getByText('toggle'));

    expect(useLocaleStore.getState().locale).toBe('en');
  });

  it('sets cookie when locale changes', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <TestComponent />
      </LocaleProvider>
    );

    await user.click(screen.getByText('toggle'));

    expect(document.cookie).toContain('locale=en');
  });

  it('throws when useTranslation is used outside provider', () => {
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useTranslation must be used within a LocaleProvider');
  });
});
