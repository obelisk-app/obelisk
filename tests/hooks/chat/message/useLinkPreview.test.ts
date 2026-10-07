import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLinkPreview } from '@/hooks/chat/message/useLinkPreview';
import type { LinkPreview } from '@/utils/link-preview/link-preview';

const preview = (over: Partial<LinkPreview> = {}) => ({ url: 'https://www.example.com/a', siteName: 'Example', title: 'T', ...over }) as LinkPreview;

describe('useLinkPreview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks our own route and keeps a good answer', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => preview() }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useLinkPreview('https://example.com/a?b=1'));
    await waitFor(() => expect(result.current?.title).toBe('T'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/link-preview?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1');
  });

  it('stays null on an error payload or a failed request', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ error: 'nope' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useLinkPreview('https://example.com/b'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});
