import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import SocialSection from '@/components/marketing/landing/SocialSection';
import { SOCIAL_ACCOUNTS } from '@/constants/marketing/landing';

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe('SocialSection', () => {
  beforeEach(() => { vi.stubGlobal('IntersectionObserver', MockIntersectionObserver); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('links every official account in a new tab', () => {
    render(<LocaleProvider initialLocale="en"><SocialSection /></LocaleProvider>);
    expect(SOCIAL_ACCOUNTS.map((a) => a.handle)).toEqual(['@obelisk.ar', '@obelisk_ar', '@obelisk_ar']);
    for (const account of SOCIAL_ACCOUNTS) {
      const link = screen.getByTestId(`landing-social-${account.id}`);
      expect(link).toHaveAttribute('href', account.href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link).toHaveTextContent(account.handle);
      expect(link).toHaveTextContent('Follow');
    }
  });

  it('speaks Spanish on /es', () => {
    render(<LocaleProvider initialLocale="es"><SocialSection /></LocaleProvider>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Seguí a Obelisk');
    expect(screen.getByTestId('landing-social-instagram')).toHaveTextContent('Seguir');
  });
});
