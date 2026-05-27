import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/i18n/context', () => ({
  LocaleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', setLocale: vi.fn() }),
}));

vi.mock('@/components/settings/WotSettings', () => ({
  default: () => <div data-testid="wot-settings" />,
}));

vi.mock('@/lib/nostr-bridge/cache-clear', () => ({
  clearAllClientCacheExceptSession: () => 0,
}));

describe('PreferencesPanel appearance controls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('includes shared app appearance controls', async () => {
    const { PreferencesPanel } = await import('./UserPanel');

    render(
      <LocaleProvider initialLocale="en">
        <PreferencesPanel />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('appearance-accent-color')).toBeInTheDocument();
    expect(screen.getByTestId('appearance-background-color')).toBeInTheDocument();
    expect(screen.getByTestId('appearance-button-color')).toBeInTheDocument();
  });
});
