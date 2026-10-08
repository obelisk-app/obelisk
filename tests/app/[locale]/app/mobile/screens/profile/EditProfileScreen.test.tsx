/**
 * The phone's profile editor: what `settings-profile.test.tsx` does not pin.
 * Picking an image (validation, object-URL previews and when they are
 * revoked), switching between a picked file and a typed URL, the save and
 * back buttons, and the upload state while saving.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';

const blossom = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@/services/media/blossom', () => ({
  uploadToBlossom: (...args: Parameters<typeof import('@/services/media/blossom')['uploadToBlossom']>) => blossom.upload(...args),
  BlossomUploadError: class extends Error {},
}));

import { EditProfileScreen } from '@/app/[locale]/app/mobile/screens/profile/EditProfileScreen';

const META = {
  pubkey: BRIDGE_MOCK_PUBKEY,
  name: 'Fabricio',
  displayName: 'Fabricio',
  about: 'Bio',
  picture: '',
  banner: '',
  nip05: '',
  lud16: '',
  website: '',
};

let minted = 0;
const createObjectURL = vi.fn(() => `blob:preview-${++minted}`);
const revokeObjectURL = vi.fn();

function setup(go = vi.fn()) {
  const editUserMetadata = vi.fn().mockResolvedValue(undefined);
  const bridge = fakeBridge({ userMetadata: { [BRIDGE_MOCK_PUBKEY]: META } as never }, { editUserMetadata } as never);
  const view = renderWithBridge(<EditProfileScreen go={go} />, bridge);
  const [bannerInput, avatarInput] = Array.from(view.container.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
  return { ...view, go, editUserMetadata, bannerInput, avatarInput };
}

function image(name = 'a.png', size = 1024, type = 'image/png'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const pick = (input: HTMLInputElement, file: File) => fireEvent.change(input, { target: { files: [file] } });
const pictureUrl = () => screen.getByTestId('edit-picture-url') as HTMLInputElement;
const bannerUrl = () => screen.getByTestId('edit-banner-url') as HTMLInputElement;

beforeEach(() => {
  minted = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  blossom.upload.mockReset().mockResolvedValue('https://blossom.example/img.jpg');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('EditProfileScreen image picking', () => {
  it('refuses a file that is not an image', () => {
    const { avatarInput } = setup();
    pick(avatarInput, image('notes.txt', 10, 'text/plain'));
    expect(screen.getByRole('alert').textContent).toBe('Please select an image file');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('refuses an image over 10 MB and accepts one of exactly 10 MB', () => {
    const { bannerInput } = setup();
    pick(bannerInput, image('big.png', 10 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert').textContent).toBe('Image is too large (max 10MB)');
    pick(bannerInput, image('ok.png', 10 * 1024 * 1024));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('previews a picked avatar and swaps the URL field for the file placeholder', () => {
    const { avatarInput } = setup();
    pick(avatarInput, image());
    const tap = screen.getByTestId('edit-avatar-tap');
    expect(tap.querySelector('img')).toHaveAttribute('src', 'blob:preview-1');
    expect(tap.className).not.toContain('empty');
    expect(pictureUrl().value).toBe('');
    expect(pictureUrl()).toHaveAttribute('placeholder', 'File selected, saves on publish');
    expect(avatarInput.value).toBe('');
  });

  it('previews a picked banner and relabels the overlay', () => {
    const { bannerInput } = setup();
    const tap = screen.getByTestId('edit-banner-tap');
    expect(tap.className).toContain('empty');
    expect(tap.textContent).toContain('Tap to add banner');
    pick(bannerInput, image());
    expect(tap.className).not.toContain('empty');
    expect(tap.querySelector('img')).toHaveAttribute('src', 'blob:preview-1');
    expect(tap.textContent).toContain('Change banner');
    expect(bannerUrl()).toHaveAttribute('placeholder', 'File selected, saves on publish');
  });

  it('revokes the previous preview when a second avatar is picked', () => {
    const { avatarInput } = setup();
    pick(avatarInput, image('one.png'));
    pick(avatarInput, image('two.png'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(screen.getByTestId('edit-avatar-tap').querySelector('img')).toHaveAttribute('src', 'blob:preview-2');
  });

  it('typing a URL drops the picked file and its preview', () => {
    const { avatarInput, bannerInput } = setup();
    pick(avatarInput, image('one.png'));
    pick(bannerInput, image('two.png'));
    revokeObjectURL.mockClear();
    fireEvent.change(pictureUrl(), { target: { value: 'https://cdn.example/me.png' } });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(pictureUrl().value).toBe('https://cdn.example/me.png');
    expect(pictureUrl()).toHaveAttribute('placeholder', 'https://…');
    expect(screen.getByTestId('edit-avatar-tap').querySelector('img')).toHaveAttribute('src', 'https://cdn.example/me.png');

    fireEvent.change(bannerUrl(), { target: { value: 'https://cdn.example/b.png' } });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
    expect(screen.getByTestId('edit-banner-tap').querySelector('img')).toHaveAttribute('src', 'https://cdn.example/b.png');
  });

  it('revokes outstanding previews on unmount', () => {
    const { avatarInput, bannerInput, unmount } = setup();
    pick(avatarInput, image('one.png'));
    pick(bannerInput, image('two.png'));
    revokeObjectURL.mockClear();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
  });
});

describe('EditProfileScreen saving', () => {
  it('uploads a picked avatar on save, shows the busy state, then publishes and goes back', async () => {
    let finish: (url: string) => void = () => {};
    blossom.upload.mockReturnValue(new Promise<string>((resolve) => { finish = resolve; }));
    const { avatarInput, editUserMetadata, go } = setup();
    const file = image();
    pick(avatarInput, file);
    await act(async () => { fireEvent.click(screen.getByTestId('save-profile')); });
    await waitFor(() => expect(blossom.upload).toHaveBeenCalledWith(file, undefined, expect.objectContaining({
      assertCurrent: expect.any(Function), signEventTemplate: expect.any(Function),
    })));
    expect(screen.getByTestId('save-profile').textContent).toBe('Saving...');
    expect(screen.getByTestId('save-profile')).toBeDisabled();
    expect(screen.getByTestId('edit-avatar-tap').className).toContain('uploading');
    expect(screen.getByTestId('edit-avatar-tap').querySelector('.edit-uploading-spinner')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await act(async () => { finish('https://blossom.example/me.jpg'); });
    expect(editUserMetadata.mock.calls[0][0]).toMatchObject({ picture: 'https://blossom.example/me.jpg' });
    expect(go).toHaveBeenCalledWith('settings-profile', 'back');
  });

  it('the bottom button saves too, and is labelled Save changes', async () => {
    const { editUserMetadata } = setup();
    const bottom = screen.getByRole('button', { name: 'Save changes' });
    expect(bottom).toHaveClass('btn-primary');
    expect(screen.getByTestId('save-profile').textContent).toBe('Save');
    await act(async () => { fireEvent.click(bottom); });
    expect(editUserMetadata).toHaveBeenCalledTimes(1);
  });

  it('the back button goes back to the profile', () => {
    const { go } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(go).toHaveBeenCalledWith('settings-profile', 'back');
  });

  it('the banner and avatar taps open their file pickers', () => {
    const { avatarInput, bannerInput } = setup();
    const avatarClick = vi.spyOn(avatarInput, 'click');
    const bannerClick = vi.spyOn(bannerInput, 'click');
    fireEvent.click(screen.getByTestId('edit-banner-tap'));
    expect(bannerClick).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('edit-avatar-tap'));
    expect(avatarClick).toHaveBeenCalled();
  });
});
