import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resetNip05Cache, verifyNip05 } from '@/services/nip05-verify';
import { useNip05Status } from '@/hooks/useNip05Status';

const PUBKEY = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetNip05Cache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useNip05Status', () => {
  it('in peek mode reports the cache and never fetches', () => {
    const { result } = renderHook(() => useNip05Status(PUBKEY, 'alice@example.com'));
    expect(result.current).toBe('unchecked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('in verify mode goes unchecked → checking → verified', async () => {
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { resolve = r; }));
    const { result } = renderHook(() => useNip05Status(PUBKEY, 'alice@example.com', 'verify'));
    expect(result.current).toBe('checking');
    await act(async () => {
      resolve(jsonResponse({ names: { alice: PUBKEY } }));
      await Promise.resolve();
    });
    expect(result.current).toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('in verify mode settles on unverified for a mismatch', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: OTHER } }));
    const { result } = renderHook(() => useNip05Status(PUBKEY, 'alice@example.com', 'verify'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBe('unverified');
  });

  it('a peek-mode row sees a result another surface established', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }));
    const row = renderHook(() => useNip05Status(PUBKEY, 'alice@example.com'));
    expect(row.result.current).toBe('unchecked');
    await act(async () => { await verifyNip05(PUBKEY, 'alice@example.com'); });
    expect(row.result.current).toBe('verified');
  });
});
