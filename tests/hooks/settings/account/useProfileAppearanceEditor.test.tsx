import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useProfileAppearanceEditor } from '@/hooks/settings/account/useProfileAppearanceEditor';
import { MAX_IMAGE_BYTES } from '@/constants/settings/profile-image';

const VALUE = { pictureUrl: 'https://x/p.png', bannerUrl: '', pictureFile: null, bannerFile: null };

function picked(file: File) {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  return input;
}
const image = (size = 10, type = 'image/png') => {
  const f = new File(['x'], 'a.png', { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

const saved = {
  create: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  revoke: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
};
const revoke = vi.fn();
beforeEach(() => {
  let n = 0;
  revoke.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => `blob:${++n}` });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
});
afterEach(() => {
  for (const [key, desc] of [['createObjectURL', saved.create], ['revokeObjectURL', saved.revoke]] as const) {
    if (desc) Object.defineProperty(URL, key, desc);
    else delete (URL as unknown as Record<string, unknown>)[key];
  }
});

describe('useProfileAppearanceEditor', () => {
  it('stages a picked image and previews it over the saved URL', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useProfileAppearanceEditor(VALUE, onChange), { wrapper: LocaleProvider });
    expect(result.current.pictureSrc).toBe('https://x/p.png');
    const file = image();
    act(() => result.current.picked('picture', picked(file)));
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, pictureFile: file });
    expect(result.current.pictureSrc).toBe('blob:1');
    expect(result.current.error).toBeNull();
  });

  it('refuses a non-image or an oversized one and says why', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useProfileAppearanceEditor(VALUE, onChange), { wrapper: LocaleProvider });
    act(() => result.current.picked('banner', picked(image(10, 'text/plain'))));
    expect(result.current.error).toMatch(/image/i);
    act(() => result.current.picked('banner', picked(image(MAX_IMAGE_BYTES + 1))));
    expect(result.current.error).toMatch(/10/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a typed URL drops the preview and the staged file', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useProfileAppearanceEditor(VALUE, onChange), { wrapper: LocaleProvider });
    act(() => result.current.picked('banner', picked(image())));
    act(() => result.current.setUrl('banner', 'https://x/b.png'));
    expect(revoke).toHaveBeenCalledWith('blob:1');
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, bannerUrl: 'https://x/b.png', bannerFile: null });
    expect(result.current.bannerSrc).toBe('');
  });
});
