import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="shell" /> }));
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useIsLoggedIn: () => true });
});
vi.mock('@/services/read-state/root', () => ({ default: () => null }));
vi.mock('@/components/feedback/ActivityIndicator', () => ({
  default: () => <div data-testid="desktop-activity-indicator" />,
}));

import AppGate from '@/app/app/AppGate';

describe('AppGate activity indicator', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('does not mount the desktop activity notification stack on mobile', async () => {
    render(<AppGate />);

    await waitFor(() => expect(screen.getByTestId('shell')).toBeInTheDocument());
    expect(screen.queryByTestId('desktop-activity-indicator')).toBeNull();
  });
});
