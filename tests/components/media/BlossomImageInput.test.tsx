import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const uploadToBlossom = vi.fn();

vi.mock('@/services/blossom', () => ({ uploadToBlossom }));

import { ChannelAppearanceInput } from '@/components/media/BlossomImageInput';
import { LocaleProvider } from '@/i18n/context';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


describe('ChannelAppearanceInput', () => {
  it('shows a social header preview and only file upload controls', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://cdn.example/new-picture.jpg');
    const onPictureChange = vi.fn();

    renderLocalized(
      <ChannelAppearanceInput
        picture="https://cdn.example/picture.jpg"
        banner="https://cdn.example/banner.jpg"
        onPictureChange={onPictureChange}
        onBannerChange={() => {}}
      />,
    );

    expect(screen.getByAltText('Channel banner preview')).toHaveAttribute('src', 'https://cdn.example/banner.jpg');
    expect(screen.getByAltText('Channel profile picture preview')).toHaveAttribute('src', 'https://cdn.example/picture.jpg');
    expect(screen.getByTestId('channel-appearance-preview')).toHaveClass('aspect-[4/1]');
    expect(screen.getByAltText('Channel profile picture preview').parentElement).toHaveClass('h-24', 'w-24');
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.change(screen.getByLabelText('Upload profile picture'), {
      target: { files: [new File(['picture'], 'picture.jpg', { type: 'image/jpeg' })] },
    });

    await waitFor(() => expect(onPictureChange).toHaveBeenCalledWith('https://cdn.example/new-picture.jpg'));
  });
});

describe('BlossomImageInput', () => {
  it('names the URL field after its visible label', async () => {
    const { default: BlossomImageInput } = await import('@/components/media/BlossomImageInput');
    const onChange = vi.fn();
    renderLocalized(<BlossomImageInput label="Group icon" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Group icon' }), { target: { value: 'https://cdn.example/i.png' } });
    expect(onChange).toHaveBeenCalledWith('https://cdn.example/i.png');
  });

  it('uploads a picked file and fills the field', async () => {
    uploadToBlossom.mockResolvedValueOnce('https://cdn.example/up.png');
    const { default: BlossomImageInput } = await import('@/components/media/BlossomImageInput');
    const onChange = vi.fn();
    renderLocalized(<BlossomImageInput label="Group icon" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Upload'), {
      target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://cdn.example/up.png'));
  });
});
