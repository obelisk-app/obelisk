import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const uploadToBlossom = vi.fn();
vi.mock('@/services/media/blossom', () => ({ uploadToBlossom }));

import { useBlossomImageInput } from '@/hooks/media/upload/useBlossomImageInput';
import { useChannelAppearanceInput } from '@/hooks/media/upload/useChannelAppearanceInput';

function picked(files: File[]) {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  return input;
}

describe('useBlossomImageInput', () => {
  it('uploads the picked file into the field and ignores an empty pick', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://cdn.example/a.png');
    const onChange = vi.fn();
    const { result } = renderHook(() => useBlossomImageInput(onChange), { wrapper: LocaleProvider });
    act(() => result.current.picked(picked([])));
    expect(uploadToBlossom).not.toHaveBeenCalled();
    act(() => result.current.picked(picked([new File(['a'], 'a.png')])));
    expect(result.current.uploading).toBe(true);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.example/a.png'));
    expect(result.current.uploading).toBe(false);
  });
});

describe('useChannelAppearanceInput', () => {
  it('sends each upload to its own field and says which one is uploading', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://cdn.example/banner.png');
    const onPicture = vi.fn();
    const onBanner = vi.fn();
    const { result } = renderHook(() => useChannelAppearanceInput(onPicture, onBanner), { wrapper: LocaleProvider });
    act(() => result.current.picked(picked([new File(['b'], 'b.png')]), 'banner'));
    expect(result.current.uploading).toBe('banner');
    await waitFor(() => expect(onBanner).toHaveBeenCalledWith('https://cdn.example/banner.png'));
    expect(onPicture).not.toHaveBeenCalled();
    expect(result.current.uploading).toBeNull();
  });
});
