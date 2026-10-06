import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge/client', () => ({
  getBridge: vi.fn(),
  getBridgeImpl: vi.fn(),
  isImportableRelayUrl: vi.fn((url: string) => url.startsWith('wss://')),
}));

import { __testing, fetchSfuInfo, getSfuPin } from '@/services/voice/sfu-pin';

const PUBKEY = 'a'.repeat(64);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); __testing.reset(); });

describe('ingest', () => {
  const event = (content: string) => ({
    id: 'e'.repeat(64), pubkey: 'b'.repeat(64), created_at: 10, kind: 30078, tags: [], content, sig: '',
  });

  it('names a pin that does not parse instead of dropping it silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __testing.ingest('ch1', event('{not json'));
    expect(getSfuPin('ch1')).toBeNull();
    expect(warn).toHaveBeenCalledWith('[voice] ignoring unparseable SFU pin', 'e'.repeat(64), 'from', 'bbbbbbbb', expect.any(Error));
  });

  it('caches a valid pin', () => {
    __testing.ingest('ch1', event(JSON.stringify({ pubkey: PUBKEY, url: 'https://sfu.obelisk.ar', trustedRelays: ['wss://r.example'] })));
    expect(getSfuPin('ch1')).toMatchObject({ pubkey: PUBKEY, url: 'https://sfu.obelisk.ar', trustedRelays: ['wss://r.example'] });
  });
});

describe('fetchSfuInfo', () => {
  it('validates an SFU URL and derives its identity and relay fallback', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      service: 'obelisk-sfu',
      pubkey: PUBKEY.toUpperCase(),
      url: 'https://sfu.obelisk.ar',
      relays: ['wss://public.obelisk.ar', 'ws://localhost:4869'],
      trustedAuthorRelays: ['wss://lacrypta-relay.obelisk.ar'],
      cap: 50,
      operator: 'b'.repeat(64),
      region: 'eu-central',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSfuInfo('https://sfu.obelisk.ar/admin')).resolves.toEqual({
      pubkey: PUBKEY,
      url: 'https://sfu.obelisk.ar',
      relays: ['wss://public.obelisk.ar'],
      trustedRelays: ['wss://lacrypta-relay.obelisk.ar'],
      cap: 50,
      operator: 'b'.repeat(64),
      region: 'eu-central',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://sfu.obelisk.ar/info'),
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('rejects descriptors whose advertised origin does not match', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      service: 'obelisk-sfu',
      pubkey: PUBKEY,
      url: 'https://evil.example',
    }), { status: 200 })));

    await expect(fetchSfuInfo('https://sfu.obelisk.ar')).rejects.toThrow(
      'SFU /info URL does not match',
    );
    await expect(fetchSfuInfo('https://sfu.obelisk.ar')).rejects.toMatchObject({ code: 'sfuOriginMismatch' });
  });

  it('carries a code the settings form can translate', async () => {
    await expect(fetchSfuInfo('not a url')).rejects.toMatchObject({ code: 'sfuUrlInvalid' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })));
    await expect(fetchSfuInfo('https://sfu.obelisk.ar')).rejects.toMatchObject({ code: 'sfuInfoHttp' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ service: 'other' }), { status: 200 })));
    await expect(fetchSfuInfo('https://sfu.obelisk.ar')).rejects.toMatchObject({ code: 'sfuNotObelisk' });
  });
});
