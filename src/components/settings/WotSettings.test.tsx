import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/wot', async () => {
  const React = await import('react');
  const state = {
    enabled: false,
    maxHops: 2,
    minPaths: 1,
    status: 'configured' as 'configured' | 'absent' | 'error',
  };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const store = {
    ...state,
    setEnabled: (next: boolean) => { state.enabled = next; store.enabled = next; notify(); },
    setMaxHops: vi.fn(),
    setMinPaths: vi.fn(),
    refreshStatus: vi.fn(),
  };
  const useWotStore = (selector: (s: any) => any) => React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(store),
    () => selector(store),
  );
  return {
    initializeWot: vi.fn(),
    useWotStore,
    wotEngine: {
      stats: () => ({ allow: 3, deny: 2, pending: 1 }),
      on: () => () => {},
    },
    __wotState: state,
  };
});

describe('WotSettings', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/lib/wot') as any;
    mod.__wotState.enabled = false;
    mod.__wotState.status = 'configured';
  });

  it('hides WoT description, parameters, legend, and stats until enabled', async () => {
    const user = userEvent.setup();
    const { default: WotSettings } = await import('./WotSettings');

    render(<WotSettings />);

    expect(screen.getByText('Web of Trust')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/Drop events authored/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Max hops/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Min trust paths/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Channel colors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/resolved allow/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch'));

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Drop events authored/i)).toBeInTheDocument();
    expect(screen.getByText(/Max hops/i)).toBeInTheDocument();
    expect(screen.getByText(/Min trust paths/i)).toBeInTheDocument();
    expect(screen.getByText(/Channel colors/i)).toBeInTheDocument();
    expect(screen.getByText(/resolved allow/i)).toBeInTheDocument();
  });
});
