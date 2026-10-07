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
    __store: store,
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

  it('starts the WoT probe on mount, rechecks on demand, and cannot be enabled without the extension', async () => {
    const user = userEvent.setup();
    const mod = await import('@/services/wot') as unknown as {
      initializeWot: ReturnType<typeof vi.fn>; __store: { status: string; refreshStatus: ReturnType<typeof vi.fn> };
    };
    mod.__store.status = 'error';
    const { default: WotSettings } = await import('@/components/settings/privacy/WotSettings');
    renderLocalized(<WotSettings />);
    expect(mod.initializeWot).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText(/Extension error/)).toHaveClass('text-red-400');
    await user.click(screen.getByRole('button', { name: 're-check' }));
    expect(mod.__store.refreshStatus).toHaveBeenCalledTimes(1);
    mod.__store.status = 'configured';
  });

  it('moves the sliders through the store setters and shows the engine counts', async () => {
    const mod = await import('@/services/wot') as unknown as {
      __store: { enabled: boolean; setMaxHops: ReturnType<typeof vi.fn>; setMinPaths: ReturnType<typeof vi.fn> };
    };
    mod.__store.enabled = true;
    const { default: WotSettings } = await import('@/components/settings/privacy/WotSettings');
    const { fireEvent } = await import('@testing-library/react');
    renderLocalized(<WotSettings />);
    fireEvent.change(screen.getByRole('slider', { name: /Max hops/i }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('slider', { name: /Min trust paths/i }), { target: { value: '2' } });
    expect(mod.__store.setMaxHops).toHaveBeenCalledWith(3);
    expect(mod.__store.setMinPaths).toHaveBeenCalledWith(2);
    expect(screen.getByText(/Extension detected/)).toHaveClass('text-lc-green');
    expect(screen.getByText('resolved allow').nextSibling).toHaveTextContent('3');
  });
});
