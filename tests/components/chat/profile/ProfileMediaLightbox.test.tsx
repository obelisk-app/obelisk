import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { ProfileMediaLightbox } from '@/components/chat/profile/ProfileMediaLightbox';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('ProfileMediaLightbox', () => {
  it('shows an image, a video for video URLs, and closes on Escape or backdrop', () => {
    const onClose = vi.fn();
    const { rerender } = renderLocalized(<ProfileMediaLightbox url="https://x/a.jpg" onClose={onClose} />);
    expect(screen.getByTestId('profile-media-lightbox').querySelector('img')).toHaveAttribute('src', 'https://x/a.jpg');
    fireEvent.click(screen.getByTestId('profile-media-lightbox').querySelector('img')!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('profile-media-lightbox'));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<LocaleProvider initialLocale="en"><ProfileMediaLightbox url="https://x/a.mp4" onClose={onClose} /></LocaleProvider>);
    expect(screen.getByTestId('profile-media-lightbox').querySelector('video')).toBeInTheDocument();
  });
});
