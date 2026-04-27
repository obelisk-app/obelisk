import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lnbitsToNwc } from './lnbits-to-nwc';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('lnbitsToNwc', () => {
  it('GETs the NWC plugin endpoint with the admin key and returns nwcUri', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ uri: 'nostr+walletconnect://abc?relay=wss%3A%2F%2Fr&secret=def' }),
    });
    const r = await lnbitsToNwc('https://lnbits.example', 'admin_key_xyz');
    expect(r.nwcUri).toBe('nostr+walletconnect://abc?relay=wss%3A%2F%2Fr&secret=def');
    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl).toContain('lnbits.example');
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers;
    expect(headers['X-Api-Key']).toBe('admin_key_xyz');
  });

  it('strips trailing slashes from instanceUrl', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ uri: 'nostr+walletconnect://x' }) });
    await lnbitsToNwc('https://lnbits.example///', 'k');
    const callUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(callUrl.startsWith('https://lnbits.example/')).toBe(true);
    expect(callUrl).not.toContain('//api');
  });

  it('throws with friendly message if the NWC plugin is not enabled (404)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(lnbitsToNwc('https://lnbits.example', 'k')).rejects.toThrow(/nwc plugin/i);
  });

  it('throws on auth failure (401)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(lnbitsToNwc('https://lnbits.example', 'bad')).rejects.toThrow(/admin key|auth/i);
  });

  it('rejects empty inputs', async () => {
    await expect(lnbitsToNwc('', 'k')).rejects.toThrow(/url/i);
    await expect(lnbitsToNwc('https://x', '')).rejects.toThrow(/admin key/i);
  });
});
