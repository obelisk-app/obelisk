import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { useVoiceStore } from '@/store/voice';
import { FakeMediaStream, FakeMediaStreamTrack } from '@tests/support/mocks/webrtc';

vi.mock('@/services/nostr-bridge', () => ({
  useUserMetadata: (pk: string) => (pk === A ? { displayName: 'Ada', picture: 'https://img.test/ada.png' } : null),
}));

import AudioChip from '@/components/voice/room/AudioChip';
import AudioTile from '@/components/voice/room/AudioTile';
import Avatar from '@/components/voice/room/VoiceAvatar';
import QualityDot from '@/components/voice/room/QualityDot';
import RailAudioTile from '@/components/voice/room/RailAudioTile';
import Stage from '@/components/voice/room/Stage';
import VideoTile from '@/components/voice/room/VideoTile';

/** The tiles read their copy through next-intl, so every render gets the English messages. */
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: LocaleProvider });

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

beforeEach(() => {
  useVoiceStore.setState({ peerQuality: {}, speakingPubkeys: {}, localMutedPubkeys: {} });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QualityDot', () => {
  it('is unknown without a sample and follows the store sample', () => {
    const { rerender } = render(<QualityDot pubkey={A} />);
    expect(screen.getByTestId('peer-quality-dot')).toHaveAttribute('data-quality', 'unknown');
    useVoiceStore.getState().setPeerQuality(A, {
      level: 'poor', rttMs: 400, loss: 0.2, jitterMs: 50, outboundVideoBps: 250_000, outboundFps: 12, qualityLimitationReason: 'bandwidth',
    });
    rerender(<QualityDot pubkey={A} />);
    const dot = screen.getByTestId('peer-quality-dot');
    expect(dot).toHaveAttribute('data-quality', 'poor');
    expect(dot.getAttribute('title')).toContain('250 kbps');
    expect(dot.getAttribute('title')).toContain('20.0% loss');
  });
});

describe('audio tiles', () => {
  it('shows the profile name, the speaking ring and a mute-for-me button for a remote peer', () => {
    useVoiceStore.getState().setSpeaking(A, true);
    render(<AudioTile pubkey={A} isLocal={false} />);
    const tile = screen.getByTestId('voice-participant');
    expect(tile).toHaveTextContent('Ada');
    expect(tile.className).toContain('ring-lc-green');
    expect(screen.getByTestId('mute-for-me')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img.test/ada.png');
  });

  it('labels the local tile "You" and offers no mute-for-me or quality dot', () => {
    render(<AudioTile pubkey={B} isLocal />);
    expect(screen.getByTestId('voice-participant')).toHaveTextContent(`You · ${B.slice(0, 8)}`);
    expect(screen.queryByTestId('mute-for-me')).toBeNull();
    expect(screen.queryByTestId('peer-quality-dot')).toBeNull();
  });

  it('the rail tile and the chip carry the same name and mute control', () => {
    render(<><RailAudioTile pubkey={A} isLocal={false} /><AudioChip pubkey={A} isLocal={false} /></>);
    expect(screen.getAllByTestId('voice-participant')).toHaveLength(2);
    expect(screen.getAllByTestId('mute-for-me')).toHaveLength(2);
    expect(screen.getAllByText('Ada')).toHaveLength(2);
  });
});

describe('VideoTile', () => {
  it('falls back to the avatar without a stream and pins on Enter', () => {
    const onPin = vi.fn();
    render(<VideoTile pubkey={B} isLocal={false} videoStream={null} onPin={onPin} />);
    const tile = screen.getByTestId('video-tile');
    expect(tile).toHaveAttribute('role', 'button');
    expect(tile.querySelector('video')).toBeNull();
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(onPin).toHaveBeenCalledTimes(1);
    fireEvent.click(tile);
    expect(onPin).toHaveBeenCalledTimes(2);
  });

  it('binds the stream to a mirrored video for the local camera', () => {
    const stream = new FakeMediaStream([new FakeMediaStreamTrack('video')]) as unknown as MediaStream;
    render(<VideoTile pubkey={B} isLocal videoStream={stream} />);
    const video = screen.getByTestId('video-tile').querySelector('video')!;
    expect(video.srcObject).toBe(stream);
    expect(video.className).toContain('scale-x-[-1]');
    expect(screen.getByTestId('video-tile')).not.toHaveAttribute('role');
  });
});

describe('Stage', () => {
  it('says who is presenting and toggles the pin', () => {
    const onTogglePin = vi.fn();
    render(<Stage pubkey={A} isLocal={false} kind="screen" videoStream={null} pinned={false} onTogglePin={onTogglePin} />);
    expect(screen.getByTestId('screen-share-area')).toHaveTextContent('Ada is presenting');
    fireEvent.click(screen.getByTitle('Pin to stage'));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it('labels a pinned local camera stage', () => {
    render(<Stage pubkey={B} isLocal kind="camera" videoStream={null} pinned onTogglePin={() => {}} />);
    expect(screen.getByTestId('video-stage')).toHaveTextContent('You ·');
    expect(screen.getByTitle('Unpin')).toHaveTextContent('Pinned');
    expect(screen.queryByTestId('mute-for-me')).toBeNull();
  });
});

describe('Avatar', () => {
  it('draws the initial when there is no picture', () => {
    const { container } = render(<Avatar pubkey={B} name="ben" size={6} />);
    expect(container.textContent).toBe('B');
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws a picture as remote media, without a referrer', () => {
    render(<Avatar pubkey={B} picture="https://x.example/b.png" name="ben" size={6} />);
    const img = screen.getByRole('img', { name: 'ben' });
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveStyle({ width: '24px', height: '24px' });
  });
});
