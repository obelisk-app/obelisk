import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadToBlossom = vi.hoisted(() => vi.fn());
vi.mock('@/services/media/blossom', () => ({ uploadToBlossom }));

import { useBlossomUpload } from '@/hooks/media/upload/useBlossomUpload';
import { LocaleProvider } from '@tests/support/intl';

const FILE = new File(['x'], 'x.png', { type: 'image/png' });

beforeEach(() => uploadToBlossom.mockReset());

describe('useBlossomUpload', () => {
  it('hands the uploaded url to the caller and clears the slot', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://cdn/x.png');
    const done = vi.fn();
    const { result } = renderHook(() => useBlossomUpload<'banner'>(), { wrapper: LocaleProvider });
    await act(() => result.current.upload(FILE, 'banner', done));
    expect(done).toHaveBeenCalledWith('https://cdn/x.png');
    expect(result.current.uploading).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('marks which slot is uploading while it runs', async () => {
    let resolve!: (url: string) => void;
    uploadToBlossom.mockReturnValueOnce(new Promise<string>((r) => { resolve = r; }));
    const { result } = renderHook(() => useBlossomUpload<'picture'>(), { wrapper: LocaleProvider });
    let pending!: Promise<void>;
    act(() => { pending = result.current.upload(FILE, 'picture', vi.fn()); });
    await vi.waitFor(() => expect(result.current.uploading).toBe('picture'));
    await act(async () => { resolve('https://cdn/p.png'); await pending; });
    expect(result.current.uploading).toBeNull();
  });

  it('keeps the error to show inline, in the reader language rather than the server wording', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    uploadToBlossom.mockRejectedValueOnce(new Error('blossom upload failed: cdn: 500'));
    const { result } = renderHook(() => useBlossomUpload<'file'>(), { wrapper: LocaleProvider });
    await act(() => result.current.upload(FILE, 'file', vi.fn()));
    expect(result.current.error).toBe('Upload failed.');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
