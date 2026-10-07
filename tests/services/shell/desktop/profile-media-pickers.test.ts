import { describe, expect, it, vi } from 'vitest';
import { createFilePicker, uploadProfileMedia } from '@/services/shell/desktop/profile-media-pickers';
import type { Translate } from '@/i18n/keys';

const upload = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: (...args: unknown[]) => upload.fn(...args) }));

const t = ((key: string) => key) as unknown as Translate;
const png = () => new File(['x'], 'a.png', { type: 'image/png' });

describe('createFilePicker', () => {
  it('builds a labelled hidden image input and hands over the chosen file', () => {
    const onPick = vi.fn();
    const picker = createFilePicker('banner', 'Upload banner', onPick);
    expect(picker.dataset.kind).toBe('banner');
    expect(picker.className).toBe('obelisk-media-picker obelisk-banner-picker');
    expect(picker.querySelector('.obelisk-media-prompt')?.textContent).toBe('Upload banner');
    const input = picker.querySelector('input')!;
    expect(input.accept).toBe('image/*');
    expect(input.hidden).toBe(true);
    const file = png();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(onPick).toHaveBeenCalledWith(file, picker);
  });

  it('shows a plus on the picture picker', () => {
    expect(createFilePicker('picture', 'Upload banner', vi.fn()).querySelector('.obelisk-media-prompt')?.textContent).toBe('＋');
  });
});

describe('uploadProfileMedia', () => {
  function setup(kind: 'picture' | 'banner') {
    const picker = createFilePicker(kind, 'banner', vi.fn());
    const error = document.createElement('span');
    const onDraftChange = vi.fn();
    return { picker, error, onDraftChange, args: { kind, picker, error, secretKey: new Uint8Array(32), t, onDraftChange } };
  }

  it('refuses a file that is not an image', async () => {
    const { args, error, onDraftChange } = setup('picture');
    await uploadProfileMedia({ ...args, file: new File(['x'], 'a.txt', { type: 'text/plain' }) });
    expect(error.textContent).toBe('shell.login.profile.chooseImage');
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('uploads, previews and drafts the image', async () => {
    upload.fn.mockResolvedValueOnce('https://cdn/b.png');
    const { args, picker, onDraftChange } = setup('banner');
    await uploadProfileMedia({ ...args, file: png() });
    expect(upload.fn).toHaveBeenCalledWith(expect.any(File), args.secretKey);
    expect(picker.querySelector('img')?.getAttribute('src')).toBe('https://cdn/b.png');
    expect(picker.classList.contains('has-image')).toBe(true);
    expect(picker.querySelector('.obelisk-media-prompt')?.textContent).toBe('shell.login.profile.changeBanner');
    expect(onDraftChange).toHaveBeenCalledWith({ banner: 'https://cdn/b.png' });
    expect(picker.querySelector('input')!.disabled).toBe(false);
  });

  it('reports a failed upload and offers a retry', async () => {
    upload.fn.mockRejectedValueOnce(new Error('nope'));
    const { args, picker, error, onDraftChange } = setup('picture');
    await uploadProfileMedia({ ...args, file: png() });
    expect(error.textContent).not.toBe('');
    expect(picker.querySelector('.obelisk-media-prompt')?.textContent).toBe('shell.login.profile.retry');
    expect(onDraftChange).not.toHaveBeenCalled();
    expect(picker.querySelector('input')!.disabled).toBe(false);
  });
});
