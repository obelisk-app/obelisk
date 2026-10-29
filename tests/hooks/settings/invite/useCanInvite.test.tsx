import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { useCanInvite } from '@/hooks/settings/invite/useCanInvite';

const A = 'wss://a.example';
const B = 'wss://b.example';

const signEventTemplate = vi.fn(async (t: { kind: number; tags: string[][]; content: string; created_at?: number }) => ({
  ...t, id: 'id', pubkey: 'pk', sig: 'sig', created_at: t.created_at ?? 0,
}));

function me(over: Record<string, unknown> = {}) {
  return {
    pubkey: 'pk', admitted: true, basis: null, can_mint: false, is_admin: false,
    admits_total: null, admits_used: 0, admits_left: null, codes_left: null, invited_by: null, grant: null, codes: [], ...over,
  };
}

/** `/me` per relay host; a host not listed has no invite API. */
function relaysAnswer(byHost: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = byHost[new URL(url).host];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Answers are remembered per relay and account for the visit: one account per test.
let n = 0;
function render(seed: Record<string, unknown> = {}) {
  const bridge = fakeBridge(
    { currentRelayUrl: A, configuredRelays: [A, B], myPubkey: `${++n}`.padStart(64, '0'), ...seed },
    { signEventTemplate } as unknown as Partial<BridgeImpl>,
  );
  return renderHook(() => useCanInvite(), { wrapper: bridgeWrapper(bridge) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCanInvite', () => {
  it('shows the entry for an admin whose allowance is spent, so their links stay reachable', async () => {
    relaysAnswer({ 'a.example': me({ basis: 'admin', is_admin: true, can_mint: false, admits_total: 10, admits_used: 10, admits_left: 0 }) });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('shows the entry to someone who may no longer invite but made links', async () => {
    relaysAnswer({ 'a.example': me({ codes: [{ code: 'c', status: 'expired', redemptions: [] }] }) });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('hides it for an account with no basis and no links anywhere', async () => {
    const fetchMock = relaysAnswer({ 'a.example': me(), 'b.example': me() });
    const { result } = render();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(result.current).toBe(false);
  });

  it('counts another relay in the list when signing is silent', async () => {
    relaysAnswer({ 'b.example': me({ basis: 'reference', can_mint: true, admits_total: 10, admits_left: 10 }) });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('asks only the relay in view when each signature may be a prompt', async () => {
    const fetchMock = relaysAnswer({ 'b.example': me({ basis: 'reference', can_mint: true }) });
    const { result } = render({ myLoginMethod: 'nip07' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(new URL(fetchMock.mock.calls[0][0]).host).toBe('a.example');
    expect(result.current).toBe(false);
  });
});
