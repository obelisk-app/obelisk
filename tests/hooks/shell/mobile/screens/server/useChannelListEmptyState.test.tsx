import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { ChannelListEmptyState } from '@/app/[locale]/app/mobile/screens/server/ChannelListEmptyState';
import {
  channelListEmptyReason,
  useChannelListEmptyReason,
} from '@/hooks/shell/mobile/screens/server/useChannelListEmptyState';

describe('channelListEmptyReason', () => {
  it('puts offline first, then a whitelist rejection, then a network failure', () => {
    expect(channelListEmptyReason('restricted', 'Offline', false, false)).toBe('offline');
    expect(channelListEmptyReason('auth-required', 'Connected', true, true)).toBe('whitelist');
    expect(channelListEmptyReason('unreachable', 'Connected', false, false)).toBe('network');
    expect(channelListEmptyReason('ok', 'Error: boom', false, false)).toBe('network');
  });

  it('keeps loading until the relay is connected and has had its grace period', () => {
    expect(channelListEmptyReason('ok', 'Connecting', false, true)).toBe('loading');
    expect(channelListEmptyReason('authenticating', 'Connected', false, true)).toBe('loading');
    expect(channelListEmptyReason('ok', 'Connected', false, false)).toBe('loading');
  });

  it('says none only after the relay closed its stream, and reads a silent relay as a whitelist', () => {
    expect(channelListEmptyReason('ok', 'Connected', true, false)).toBe('none');
    expect(channelListEmptyReason('ok', 'Connected', false, true)).toBe('whitelist');
  });
});

describe('useChannelListEmptyReason', () => {
  afterEach(() => vi.useRealTimers());

  it('stops loading once the grace period passes without an EOSE', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChannelListEmptyReason('ok', 'Connected', false));
    expect(result.current).toBe('loading');
    act(() => { vi.advanceTimersByTime(6000); });
    expect(result.current).toBe('whitelist');
  });
});

describe('ChannelListEmptyState', () => {
  it('shows the reason in the reader language', () => {
    render(
      <LocaleProvider initialLocale="es">
        <ChannelListEmptyState relayAccess="ok" connectionState="Connected" metadataEose />
      </LocaleProvider>,
    );
    const state = screen.getByTestId('channels-empty');
    expect(state).toHaveAttribute('data-state', 'none');
    expect(state).toHaveTextContent('No se encontraron canales');
  });

  it('spins while the channels load', () => {
    render(
      <LocaleProvider initialLocale="en">
        <ChannelListEmptyState relayAccess="unknown" connectionState="Connecting" metadataEose={false} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('channels-loading')).toHaveTextContent('Channels loading…');
  });
});
