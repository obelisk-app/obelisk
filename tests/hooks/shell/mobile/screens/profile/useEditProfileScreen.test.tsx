import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';

vi.mock('@/services/media/blossom', () => ({
  uploadToBlossom: vi.fn().mockResolvedValue('https://blossom.example/img.jpg'),
  BlossomUploadError: class extends Error {},
}));

import { useEditProfileScreen } from '@/hooks/shell/mobile/screens/profile/useEditProfileScreen';

const META = {
  pubkey: BRIDGE_MOCK_PUBKEY, name: 'Fabricio', displayName: 'Fabricio', about: 'Bio',
  picture: 'https://cdn.example/old.png', banner: '', nip05: '', lud16: '', website: '',
};

let minted = 0;
const createObjectURL = vi.fn(() => `blob:preview-${++minted}`);
const revokeObjectURL = vi.fn();

function setup(go = vi.fn()) {
  const bridge = fakeBridge({ userMetadata: { [BRIDGE_MOCK_PUBKEY]: META } as never });
  const view = renderHook(() => useEditProfileScreen(go), { wrapper: bridgeWrapper(bridge) });
  return { ...view, go };
}

/** A file input's change event carrying `file`. */
function picked(file: File) {
  const target = { files: [file], value: 'C:\\fakepath\\x.png' };
  return { event: { target } as unknown as ChangeEvent<HTMLInputElement>, target };
}

function image(type = 'image/png', size = 100): File {
  const file = new File(['x'], 'x', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeEach(() => {
  minted = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

describe('useEditProfileScreen', () => {
  it('hydrates from the kind 0 and is idle', () => {
    const { result } = setup();
    expect(result.current.myPubkey).toBe(BRIDGE_MOCK_PUBKEY);
    expect(result.current.name).toBe('Fabricio');
    expect(result.current.currentPicture).toBe('https://cdn.example/old.png');
    expect(result.current.pictureUrl).toBe('https://cdn.example/old.png');
    expect(result.current.busyLabel).toBeNull();
    expect(result.current.saveDisabled).toBe(false);
  });

  it('disables save without a name', () => {
    const { result } = setup();
    act(() => result.current.setName('  '));
    expect(result.current.saveDisabled).toBe(true);
  });

  it('a picked image becomes the preview, clears the input and stands in for the URL', () => {
    const { result } = setup();
    const { event, target } = picked(image());
    act(() => result.current.onPictureFile(event));
    expect(result.current.currentPicture).toBe('blob:preview-1');
    expect(result.current.pictureUrl).toBe('');
    expect(result.current.pictureFilePicked).toBe(true);
    expect(target.value).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('refuses a non-image and an image over 10 MB with a message', () => {
    const { result } = setup();
    act(() => result.current.onBannerFile(picked(image('text/plain')).event));
    expect(result.current.error).toBe('Please select an image file');
    act(() => result.current.onBannerFile(picked(image('image/png', 10 * 1024 * 1024 + 1)).event));
    expect(result.current.error).toBe('Image is too large (max 10MB)');
    expect(result.current.bannerFilePicked).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('an empty pick changes nothing but still resets the input', () => {
    const { result } = setup();
    const target = { files: [], value: 'x' };
    act(() => result.current.onPictureFile({ target } as unknown as ChangeEvent<HTMLInputElement>));
    expect(result.current.pictureFilePicked).toBe(false);
    expect(target.value).toBe('');
  });

  it('typing a URL drops the picked file and revokes its preview', () => {
    const { result } = setup();
    act(() => result.current.onBannerFile(picked(image()).event));
    expect(result.current.currentBanner).toBe('blob:preview-1');
    act(() => result.current.setBannerUrl('https://cdn.example/b.png'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(result.current.bannerFilePicked).toBe(false);
    expect(result.current.bannerUrl).toBe('https://cdn.example/b.png');
    expect(result.current.currentBanner).toBe('https://cdn.example/b.png');
  });

  it('goBack returns to the profile screen', () => {
    const { result, go } = setup();
    result.current.goBack();
    expect(go).toHaveBeenCalledWith('settings-profile', 'back');
  });
});

describe('useEditProfileScreen preview lifetimes', () => {
  it('keeps the banner preview alive when an avatar is picked after it', () => {
    const { result } = setup();
    act(() => result.current.onBannerFile(picked(image()).event));
    const banner = result.current.currentBanner;
    act(() => result.current.onPictureFile(picked(image()).event));
    expect(revokeObjectURL).not.toHaveBeenCalledWith(banner);
    expect(result.current.currentBanner).toBe(banner);
  });

  it('revokes only the preview being replaced, and both on unmount', () => {
    const { result, unmount } = setup();
    act(() => result.current.onPictureFile(picked(image()).event));
    const first = result.current.currentPicture;
    act(() => result.current.onBannerFile(picked(image()).event));
    const banner = result.current.currentBanner;
    act(() => result.current.onPictureFile(picked(image()).event));
    const second = result.current.currentPicture;
    expect(revokeObjectURL).toHaveBeenCalledWith(first);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(banner);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(second);
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith(banner);
    expect(revokeObjectURL).toHaveBeenCalledWith(second);
  });
});
