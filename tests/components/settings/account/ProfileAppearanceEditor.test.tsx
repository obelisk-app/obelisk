import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ProfileAppearanceEditor, {
  MAX_IMAGE_BYTES,
  validateImage,
  type ProfileAppearanceValue,
} from '@/components/settings/account/ProfileAppearanceEditor';

const PUBKEY = 'a'.repeat(64);

const baseValue: ProfileAppearanceValue = {
  pictureUrl: '',
  bannerUrl: '',
  pictureFile: null,
  bannerFile: null,
};

function renderEditor(value: Partial<ProfileAppearanceValue> = {}, onChange = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <ProfileAppearanceEditor
        pubkey={PUBKEY}
        displayName="Alice"
        value={{ ...baseValue, ...value }}
        onChange={onChange}
      />
    </LocaleProvider>,
  );
  return onChange;
}

const imageFile = (name = 'a.png', type = 'image/png', size = 1000) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('validateImage', () => {
  it('rejects non-images and oversized files', () => {
    expect(validateImage(imageFile('a.txt', 'text/plain'))).toBe('not-image');
    expect(validateImage(imageFile('a.png', 'image/png', MAX_IMAGE_BYTES + 1))).toBe('too-large');
    expect(validateImage(imageFile())).toBeNull();
  });
});

describe('ProfileAppearanceEditor', () => {
  it('makes the banner and the avatar clickable to upload', () => {
    // The desktop form previously showed a read-only preview with two URL
    // boxes beneath it; the preview itself did nothing.
    renderEditor();
    expect(screen.getByTestId('edit-banner-tap')).toBeInTheDocument();
    expect(screen.getByTestId('edit-avatar-tap')).toBeInTheDocument();
  });

  it('shows a banner URL as remote media, without a referrer', () => {
    renderEditor({ bannerUrl: 'https://example.com/b.png' });
    const banner = screen.getByTestId('edit-banner-tap').querySelector('img');
    expect(banner).toHaveAttribute('src', 'https://example.com/b.png');
    expect(banner).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('keeps the URL fields visible alongside the upload affordance', () => {
    renderEditor({ pictureUrl: 'https://example.com/a.png' });
    expect(screen.getByTestId('picture-url')).toHaveValue('https://example.com/a.png');
    expect(screen.getByTestId('banner-url')).toBeInTheDocument();
  });

  it('reports a picked file without uploading it yet', () => {
    const onChange = renderEditor();
    const input = screen.getByLabelText('Change profile picture', { selector: 'input[type="file"]' });
    fireEvent.change(input, { target: { files: [imageFile()] } });

    // Deferred upload: an abandoned edit must not burn Blossom storage.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pictureFile: expect.any(File) }),
    );
  });

  it('refuses a non-image and says why', () => {
    const onChange = renderEditor();
    const input = screen.getByLabelText('Change banner', { selector: 'input[type="file"]' });
    fireEvent.change(input, { target: { files: [imageFile('a.txt', 'text/plain')] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/isn't an image/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuses an oversized image', () => {
    renderEditor();
    const input = screen.getByLabelText('Change banner', { selector: 'input[type="file"]' });
    fireEvent.change(input, { target: { files: [imageFile('big.png', 'image/png', MAX_IMAGE_BYTES + 1)] } });
    expect(screen.getByRole('alert')).toHaveTextContent(/10 MB/i);
  });

  it('typing a URL clears any picked file, so save cannot ignore the typed value', () => {
    const onChange = renderEditor({ pictureFile: imageFile() });
    fireEvent.change(screen.getByTestId('picture-url'), {
      target: { value: 'https://example.com/new.png' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pictureUrl: 'https://example.com/new.png', pictureFile: null }),
    );
  });

  it('blanks the URL box while a file is staged so the two cannot disagree', () => {
    renderEditor({ pictureUrl: 'https://old.example/a.png', pictureFile: imageFile() });
    expect(screen.getByTestId('picture-url')).toHaveValue('');
  });

  it('ties each URL field to its visible label and names both file pickers', () => {
    renderEditor();
    expect(screen.getByLabelText('Picture', { selector: 'input' })).toBe(screen.getByTestId('picture-url'));
    expect(screen.getByLabelText('Banner', { selector: 'input' })).toBe(screen.getByTestId('banner-url'));
    const pickers = document.querySelectorAll('input[type="file"]');
    expect(pickers).toHaveLength(2);
    pickers.forEach((el) => {
      expect(el).toHaveClass('hidden');
      expect(el).toHaveAttribute('aria-label');
    });
  });

  it('previews a picked banner, and frees each preview when it is replaced, typed over or unmounted', () => {
    let n = 0;
    const create = vi.fn(() => `blob:preview-${++n}`);
    const revoke = vi.fn();
    const created = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revoked = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    try {
      const { unmount } = render(
        <LocaleProvider initialLocale="en">
          <ProfileAppearanceEditor pubkey={PUBKEY} displayName="Alice" value={baseValue} onChange={vi.fn()} />
        </LocaleProvider>,
      );
      const input = screen.getByLabelText('Change banner', { selector: 'input[type="file"]' });
      fireEvent.change(input, { target: { files: [imageFile('a.png')] } });
      expect(screen.getByTestId('edit-banner-tap').querySelector('img')).toHaveAttribute('src', 'blob:preview-1');
      fireEvent.change(input, { target: { files: [imageFile('b.png')] } });
      expect(revoke).toHaveBeenCalledWith('blob:preview-1');
      expect(screen.getByTestId('edit-banner-tap').querySelector('img')).toHaveAttribute('src', 'blob:preview-2');
      fireEvent.change(screen.getByTestId('banner-url'), { target: { value: 'https://example.com/b.png' } });
      expect(revoke).toHaveBeenCalledWith('blob:preview-2');
      fireEvent.change(screen.getByLabelText('Change profile picture', { selector: 'input[type="file"]' }), { target: { files: [imageFile('c.png')] } });
      unmount();
      expect(revoke).toHaveBeenCalledWith('blob:preview-3');
    } finally {
      if (created) Object.defineProperty(URL, 'createObjectURL', created); else delete (URL as { createObjectURL?: unknown }).createObjectURL;
      if (revoked) Object.defineProperty(URL, 'revokeObjectURL', revoked); else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });
});
