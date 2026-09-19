import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import ProfileAppearanceEditor, {
  MAX_IMAGE_BYTES,
  validateImage,
  type ProfileAppearanceValue,
} from './ProfileAppearanceEditor';

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
});
