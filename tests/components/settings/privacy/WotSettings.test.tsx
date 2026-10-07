import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


vi.mock('@/services/wot', async () => {
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
    const mod = await import('@/services/wot') as any;
    mod.__wotState.enabled = false;
    mod.__wotState.status = 'configured';
  });

  it('hides WoT description, parameters, legend, and stats until enabled', async () => {
    const user = userEvent.setup();
    const { default: WotSettings } = await import('@/components/settings/privacy/WotSettings');

    renderLocalized(<WotSettings />);

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

  it('names both sliders by their visible headings', async () => {
    const user = userEvent.setup();
    const { default: WotSettings } = await import('@/components/settings/privacy/WotSettings');
    renderLocalized(<WotSettings />);
    // The mocked store keeps `enabled` across tests; switch it on only if it is off.
    if (screen.getByRole('switch').getAttribute('aria-checked') === 'false') {
      await user.click(screen.getByRole('switch'));
    }
    const hops = screen.getByRole('slider', { name: /Max hops/i });
    const paths = screen.getByRole('slider', { name: /Min trust paths/i });
    expect(hops).toHaveAttribute('max', '4');
    expect(paths).toHaveAttribute('max', '3');
    expect(hops).toHaveClass('w-full', 'accent-lc-green');
  });

  it('speaks the reader\'s language: status, legend and the stats rows', async () => {
    const mod = await import('@/services/wot') as unknown as { __wotState: { enabled: boolean } };
    mod.__wotState.enabled = true;
    const { default: WotSettings } = await import('@/components/settings/privacy/WotSettings');

    render(<LocaleProvider initialLocale="es"><WotSettings /></LocaleProvider>);

    expect(screen.getByText(/Extensión detectada/)).toBeInTheDocument();
    expect(screen.getByText('Seguido directo')).toBeInTheDocument();
    expect(screen.getByText('Lejos / sin resolver')).toBeInTheDocument();
    expect(screen.getByText('pendientes')).toBeInTheDocument();
    expect(screen.queryByText('Direct follow')).not.toBeInTheDocument();
  });
});
