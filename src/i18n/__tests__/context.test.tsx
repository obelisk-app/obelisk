import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider, useTranslation } from '../context';

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
  });

  it('renders with initial locale from prop', () => {
    render(
      <LocaleProvider initialLocale="en">
        <TestComponent />
      </LocaleProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('translated').textContent).toBe('Chat with');
  });

  it('defaults to Spanish', () => {
    render(
      <LocaleProvider>
        <TestComponent />
      </LocaleProvider>
    );
    expect(screen.getByTestId('locale').textContent).toBe('es');
    expect(screen.getByTestId('translated').textContent).toBe('Chateá con');
  });

  it('switches locale on setLocale', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="es">
        <TestComponent />
      </LocaleProvider>
    );

    expect(screen.getByTestId('translated').textContent).toBe('Chateá con');

    await user.click(screen.getByText('toggle'));

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('translated').textContent).toBe('Chat with');
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
