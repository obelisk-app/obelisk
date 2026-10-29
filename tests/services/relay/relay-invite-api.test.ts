import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeImpl } from '@/services/nostr-bridge/facade/client';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import {
  createInviteCode,
  fetchInviteStatus,
  peekInviteStatus,
  revokeInviteCode,
} from '@/services/relay/relay-invite-api';
import { KIND_HTTP_AUTH } from '@/constants/nostr/nip-kinds';

const RELAY = 'wss://public.obelisk.ar';
const signEventTemplate = vi.fn(async (t: { kind: number; tags: string[][]; content: string; created_at?: number }) => ({
  ...t, id: 'id', pubkey: 'pk', sig: 'sig', created_at: t.created_at ?? 0,
}));

const ME = {
  pubkey: 'pk', admitted: true, basis: 'admin', can_mint: true, is_admin: true,
  admits_total: 10, admits_used: 3, admits_left: 7, codes_left: null, invited_by: null, grant: null, codes: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The NIP-98 event a request carried. */
function authEvent(init: RequestInit | undefined) {
  const header = (init?.headers as Record<string, string>).Authorization;
  expect(header.startsWith('Nostr ')).toBe(true);
  return JSON.parse(atob(header.slice('Nostr '.length))) as { kind: number; tags: string[][] };
}

// The status cache lives for the module; each test uses its own account.
let n = 0;
const nextPubkey = () => `pk-${++n}`;

beforeEach(() => {
  registerBridge({ signEventTemplate } as unknown as BridgeImpl);
});
afterEach(() => {
  unregisterBridge();
  vi.unstubAllGlobals();
  signEventTemplate.mockClear();
});

describe('relay invite API', () => {
  it('signs each request with NIP-98 for its exact URL and method', async () => {
    const fetchMock = vi.fn(async () => json(ME));
    vi.stubGlobal('fetch', fetchMock);
    await fetchInviteStatus(RELAY, nextPubkey());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://public.obelisk.ar/api/invites/me');
    expect(init.method).toBe('GET');
    const event = authEvent(init);
    expect(event.kind).toBe(KIND_HTTP_AUTH);
    expect(event.tags).toEqual([['u', 'https://public.obelisk.ar/api/invites/me'], ['method', 'GET']]);

    fetchMock.mockImplementationOnce(async () => json({ code: 'c', status: 'active' }, 201));
    await createInviteCode('wss://other.example', { label: 'meetup', maxUses: 4, expiresInSecs: 86_400 });
    const [postUrl, post] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(postUrl).toBe('https://other.example/api/invites');
    expect(authEvent(post).tags).toEqual([['u', 'https://other.example/api/invites'], ['method', 'POST']]);
    expect(JSON.parse(post.body as string)).toEqual({ label: 'meetup', max_uses: 4, expires_in: 86_400 });

    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 204 }));
    await revokeInviteCode(RELAY, 'c');
    const [delUrl, del] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(delUrl).toBe('https://public.obelisk.ar/api/invites/c');
    expect(authEvent(del).tags).toEqual([['u', 'https://public.obelisk.ar/api/invites/c'], ['method', 'DELETE']]);
  });

  it('remembers an answer, so a second look signs nothing', async () => {
    const fetchMock = vi.fn(async () => json(ME));
    vi.stubGlobal('fetch', fetchMock);
    const pk = nextPubkey();
    const me = await fetchInviteStatus(RELAY, pk);
    expect(me).toMatchObject({ basis: 'admin', admits_left: 7, admits_total: 10 });
    await fetchInviteStatus(RELAY, pk);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(peekInviteStatus(RELAY, pk)).toEqual(me);
    // `fresh` asks again (after this account changed something).
    await fetchInviteStatus(RELAY, pk, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failure: the next look asks again', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ error: 'busy' }, 503))
      .mockResolvedValueOnce(json(ME));
    vi.stubGlobal('fetch', fetchMock);
    const pk = nextPubkey();
    await expect(fetchInviteStatus(RELAY, pk)).rejects.toThrow('Failed to fetch');
    expect(peekInviteStatus(RELAY, pk)).toBeUndefined();
    await expect(fetchInviteStatus(RELAY, pk)).rejects.toThrow('busy');
    expect(peekInviteStatus(RELAY, pk)).toBeUndefined();
    expect(await fetchInviteStatus(RELAY, pk)).toMatchObject({ basis: 'admin' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reads a relay without the invite API as a remembered "no"', async () => {
    const fetchMock = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const pk = nextPubkey();
    expect(await fetchInviteStatus('wss://plain.example', pk)).toBeNull();
    expect(peekInviteStatus('wss://plain.example', pk)).toBeNull();
    expect(await fetchInviteStatus('wss://plain.example', pk)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reads an answer from a relay that predates `basis`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ pubkey: 'pk', admitted: true, can_mint: true, is_admin: false, codes_left: 2, admits_left: 5, admits_used: 1, codes: [] })));
    expect(await fetchInviteStatus(RELAY, nextPubkey())).toMatchObject({ basis: 'grant', admits_total: 6, invited_by: null });
  });
});
