import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { VideoMedia } from '@/components/chat/message/VideoMedia';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const loaded = (el: HTMLElement, props: Record<string, number>) => {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, value: v });
  fireEvent.loadedMetadata(el);
};

describe('VideoMedia', () => {
  it('a real video stays a video player, preloading metadata only when allowed', () => {
    renderLocalized(<VideoMedia url="https://x/clip.mp4" autoLoad={false} />);
    const video = screen.getByTestId('video-player');
    expect(video).toHaveAttribute('preload', 'none');
    loaded(video, { videoWidth: 640, duration: 12 });
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('an audio-only webm becomes the voice-note player with its duration', () => {
    renderLocalized(<VideoMedia url="https://x/note.webm" />);
    const video = screen.getByTestId('video-player');
    expect(video).toHaveAttribute('preload', 'metadata');
    loaded(video, { videoWidth: 0, duration: 7 });
    expect(screen.queryByTestId('video-player')).toBeNull();
    expect(screen.getByTestId('voice-message')).toBeInTheDocument();
  });
});

describe('VoiceMessage metadata', () => {
  it('takes the audio duration once known, ignoring an infinite one', async () => {
    const { VoiceMessage } = await import('@/components/chat/message/VoiceMessage');
    const { container } = renderLocalized(<VoiceMessage note={{ url: 'https://x/a.ogg', durationSeconds: 0 }} compact />);
    const audio = container.querySelector('audio')!;
    loaded(audio, { duration: Infinity });
    expect(screen.getByTestId('voice-time-row').textContent).toBe('0:000:00');
    loaded(audio, { duration: 65 });
    expect(screen.getByTestId('voice-time-row').textContent).toBe('0:001:05');
  });
});
