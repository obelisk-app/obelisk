import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';
import LanguageToggle from '../LanguageToggle';

function renderToggle(locale: 'en' | 'es' = 'es') {
  return render(
    <LocaleProvider initialLocale={locale}>
      <LanguageToggle />
    </LocaleProvider>
  );
}

describe('LanguageToggle', () => {
  it('shows "EN" when current locale is Spanish', () => {
    renderToggle('es');
    expect(screen.getByRole('button').textContent).toBe('EN');
  });

  it('shows "ES" when current locale is English', () => {
    renderToggle('en');
    expect(screen.getByRole('button').textContent).toBe('ES');
  });

  it('toggles locale on click', async () => {
    const user = userEvent.setup();
    renderToggle('es');

    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe('EN');

    await user.click(btn);
    expect(btn.textContent).toBe('ES');
  });

  it('has correct aria-label', () => {
    renderToggle('es');
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Switch to English');
  });
});
