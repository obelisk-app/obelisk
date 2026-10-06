import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="shell" /> }));
vi.mock('@/services/read-state/root', () => ({ default: () => null }));
vi.mock('@/components/feedback/ActivityIndicator', () => ({
  default: () => <div data-testid="desktop-activity-indicator" />,
}));

import AppGate from '@/app/app/AppGate';
import { LocaleProvider } from '@/i18n/context';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

describe('AppGate activity indicator', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('does not mount the desktop activity notification stack on mobile', async () => {
    renderWithBridge(<LocaleProvider initialLocale="en"><AppGate /></LocaleProvider>, fakeBridge({ isLoggedIn: true }));

    await waitFor(() => expect(screen.getByTestId('shell')).toBeInTheDocument());
    expect(screen.queryByTestId('desktop-activity-indicator')).toBeNull();
  });
});
