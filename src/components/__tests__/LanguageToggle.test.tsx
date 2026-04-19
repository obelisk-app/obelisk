import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';
import LanguageToggle from '../LanguageToggle';

const pushMock = vi.fn();
let currentPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

function renderToggle(locale: 'en' | 'es' = 'es') {
  return render(
    <LocaleProvider initialLocale={locale}>
      <LanguageToggle />
    </LocaleProvider>
  );
}

describe('LanguageToggle', () => {
  beforeEach(() => {
    pushMock.mockClear();
    currentPathname = '/';
  });

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

  it('does not navigate on non-guide routes', async () => {
    currentPathname = '/';
    const user = userEvent.setup();
    renderToggle('es');
    await user.click(screen.getByRole('button'));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('rewrites /guides (English default) to /guides/es when switching to Spanish', async () => {
    currentPathname = '/guides';
    const user = userEvent.setup();
    renderToggle('en');
    await user.click(screen.getByRole('button'));
    expect(pushMock).toHaveBeenCalledWith('/guides/es');
  });

  it('rewrites /guides/es to /guides when switching to English', async () => {
    currentPathname = '/guides/es';
    const user = userEvent.setup();
    renderToggle('es');
    await user.click(screen.getByRole('button'));
    expect(pushMock).toHaveBeenCalledWith('/guides');
  });

  it('rewrites /guides/<slug> to /guides/es/<slug> when switching to Spanish', async () => {
    currentPathname = '/guides/web-of-trust';
    const user = userEvent.setup();
    renderToggle('en');
    await user.click(screen.getByRole('button'));
    expect(pushMock).toHaveBeenCalledWith('/guides/es/web-of-trust');
  });

  it('rewrites /guides/es/<slug> to /guides/<slug> when switching to English', async () => {
    currentPathname = '/guides/es/web-of-trust';
    const user = userEvent.setup();
    renderToggle('es');
    await user.click(screen.getByRole('button'));
    expect(pushMock).toHaveBeenCalledWith('/guides/web-of-trust');
  });
});
