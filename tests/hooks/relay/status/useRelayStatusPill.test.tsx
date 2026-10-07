import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const mocks = vi.hoisted(() => ({
  statuses: {} as Record<string, unknown>,
  watchRelays: vi.fn(),
  probeRelay: vi.fn(),
}));
vi.mock('@/services/social/relay-status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/relay-status')>()),
  getRelayStatuses: () => mocks.statuses,
  subscribeRelayStatus: () => () => {},
  watchRelays: mocks.watchRelays,
  probeRelay: mocks.probeRelay,
}));

import { useRelayStatusPill } from '@/hooks/relay/status/useRelayStatusPill';

const A = 'wss://a.example';
const CHAT = 'wss://chat.example';
const RELAYS = [A];
const connected = { url: A, state: 'connected', latencyMs: 10, notes: 1, lastChange: 0 };

beforeEach(() => {
  mocks.statuses = { [A]: connected };
  mocks.watchRelays.mockReset();
  mocks.probeRelay.mockReset();
});

const render = (props: Partial<Parameters<typeof useRelayStatusPill>[0]>, access: Record<string, string> = {}) => {
  const fake = fakeBridge({ relayAccess: access as never });
  return renderHook(
    () => useRelayStatusPill({ relays: RELAYS, compact: false, indicate: 'social', ...props }),
    { wrapper: bridgeWrapper(fake) },
  );
};

describe('useRelayStatusPill', () => {
  it('starts the watcher and summarises the social set', () => {
    const { result } = render({});
    expect(mocks.watchRelays).toHaveBeenCalledWith(RELAYS);
    expect(result.current).toMatchObject({ dotState: 'connected', showCount: true, reportsActive: false });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.label).toMatch(/1/);
  });

  it('reports the chat relay instead when asked and there is one', () => {
    const { result } = render({ indicate: 'active', activeRelay: CHAT }, { [CHAT]: 'restricted' });
    expect(result.current).toMatchObject({ reportsActive: true, dotState: 'failed', showCount: false, access: 'restricted' });
    expect(result.current.label).toContain('chat.example');
  });

  it('falls back to the social set without an active relay', () => {
    const { result } = render({ indicate: 'active', activeRelay: null });
    expect(result.current.reportsActive).toBe(false);
  });

  it('hides the count in compact mode', () => {
    expect(render({ compact: true }).result.current.showCount).toBe(false);
  });

  it('closes before going to settings, and has no manage without a host', () => {
    const onOpenSettings = vi.fn();
    const { result } = render({ onOpenSettings });
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.manage!());
    expect(result.current.open).toBe(false);
    expect(onOpenSettings).toHaveBeenCalled();
    expect(render({}).result.current.manage).toBeUndefined();
  });

  it('retries a relay', () => {
    render({}).result.current.retry(A);
    expect(mocks.probeRelay).toHaveBeenCalledWith(A);
  });
});
