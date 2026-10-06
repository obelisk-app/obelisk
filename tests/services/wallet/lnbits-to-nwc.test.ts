import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lnbitsToNwc } from '@nostr-wot/wallet';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
let fetchMock: FetchMock;

/** A minimal Response: the helper only reads `ok`, `status` and `json()`. */
function reply(body: { ok: boolean; status?: number; json?: () => Promise<unknown> }): Response {
  return body as unknown as Response;
}

function requestOf(call: number): { url: string; headers: Record<string, string> } {
  const [input, init] = fetchMock.mock.calls[call];
  return { url: String(input), headers: (init?.headers ?? {}) as Record<string, string> };
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lnbitsToNwc', () => {
  it('GETs the NWC plugin endpoint with the admin key and returns nwcUri', async () => {
    fetchMock.mockResolvedValueOnce(reply({
      ok: true,
      json: async () => ({ uri: 'nostr+walletconnect://abc?relay=wss%3A%2F%2Fr&secret=def' }),
    }));
    const r = await lnbitsToNwc('https://lnbits.example', 'admin_key_xyz');
    expect(r.nwcUri).toBe('nostr+walletconnect://abc?relay=wss%3A%2F%2Fr&secret=def');
    const { url, headers } = requestOf(0);
    expect(url).toContain('lnbits.example');
    expect(headers['X-Api-Key']).toBe('admin_key_xyz');
  });

  it('strips trailing slashes from instanceUrl', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: true, json: async () => ({ uri: 'nostr+walletconnect://x' }) }));
    await lnbitsToNwc('https://lnbits.example///', 'k');
    const { url } = requestOf(0);
    expect(url.startsWith('https://lnbits.example/')).toBe(true);
    expect(url).not.toContain('//api');
  });

  it('throws with friendly message if the NWC plugin is not enabled (404)', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: false, status: 404 }));
    await expect(lnbitsToNwc('https://lnbits.example', 'k')).rejects.toThrow(/nwc plugin/i);
  });

  it('throws on auth failure (401)', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ok: false, status: 401 }));
    await expect(lnbitsToNwc('https://lnbits.example', 'bad')).rejects.toThrow(/admin key|auth/i);
  });

  it('rejects empty inputs', async () => {
    await expect(lnbitsToNwc('', 'k')).rejects.toThrow(/url/i);
    await expect(lnbitsToNwc('https://x', '')).rejects.toThrow(/admin key/i);
  });
});
