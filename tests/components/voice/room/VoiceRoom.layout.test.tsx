/**
 * The joined room's layout, pinned against the component before it was
 * split into tiles / chrome / controls / stage-layout. Everything here is
 * observable through the DOM and the voice store, so the decomposition
 * must leave every assertion untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import VoiceRoom from '@/components/voice/room/VoiceRoom';
import { useVoiceStore } from '@/store/voice';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { FakeMediaStream, FakeMediaStreamTrack } from '@tests/support/mocks/webrtc';
import type { RemoteTrack } from '@/services/voice/client';

const ME = 'me-pubkey';
const A = 'peer-a';
const B = 'peer-b';

/**
 * The real hooks over a fake bridge: an open voice room whose membership
 * has loaded, with Ada and Ben's profiles.
 */
const renderLocalized = (ui: React.ReactElement) => renderWithBridge(ui, fakeBridge({
  myPubkey: ME,
  groups: [groupFixture({ id: 'room', name: 'Room', kind: 'voice', isOpen: true })],
  membershipReadyByGroup: { room: true },
  userMetadata: {
    [A]: userMetadataFixture({ pubkey: A, displayName: 'Ada' }),
    [B]: userMetadataFixture({ pubkey: B, name: 'Ben' }),
  },
}));

const harness = vi.hoisted(() => ({
  activeClient: null as unknown,
  participants: [] as string[],
  remoteTracks: [] as unknown[],
  localCamera: null as unknown,
  setActiveVoiceClient: vi.fn(),
}));

function remote(pubkey: string, kind: RemoteTrack['kind']): RemoteTrack {
  const track = new FakeMediaStreamTrack(kind === 'audio' || kind === 'screen-audio' ? 'audio' : 'video');
  return {
    pubkey,
    viaPubkey: pubkey,
    trackId: track.id,
    kind,
    stream: new FakeMediaStream([track]) as unknown as MediaStream,
  };
}

function activeClient() {
  return {
    channelId: 'room',
    isJoined: () => true,
    leave: vi.fn(async () => {}),
    setEvents: vi.fn(),
    setExpectSfu: vi.fn(),
    setPassiveParticipantHints: vi.fn(),
    getParticipants: () => harness.participants,
    getRemoteTracks: () => harness.remoteTracks,
    getPeerConnectionStates: () => Object.fromEntries(harness.participants.map((p) => [p, 'connected'])),
    getLocalTracks: () => ({ mic: null, camera: harness.localCamera, screen: null }),
  };
}

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/common/ShootingStars', () => ({ default: () => null }));
vi.mock('@/components/voice/controls/VoiceControls', () => ({ default: () => <div data-testid="voice-controls" /> }));
vi.mock('@/components/voice/room/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('@/services/voice/sfu-control', () => ({ ensureSfuRoomStarted: vi.fn(async () => null) }));
vi.mock('@/services/voice/active-client', () => ({
  getActiveVoiceClient: () => harness.activeClient,
  setActiveVoiceClient: harness.setActiveVoiceClient,
}));
vi.mock('@/services/voice/client', () => ({ VoiceClient: vi.fn() }));


beforeEach(() => {
  // jsdom's HTMLMediaElement.play() is unimplemented and returns undefined;
  // the tiles chain `.catch` on it like a browser would.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  // The rail asks the viewport whether it scrolls horizontally and watches
  // its own size; jsdom has neither API.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  harness.participants = [];
  harness.remoteTracks = [];
  harness.localCamera = null;
  harness.activeClient = activeClient();
  useVoiceStore.getState().leaveVoice();
  useVoiceStore.setState({ currentVoiceChannelId: 'room' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderJoined() {
  renderLocalized(<VoiceRoom channelId="room" channelName="Room" />);
  await screen.findByTestId('voice-controls');
  // The room attaches to the active client in an effect after the first
  // joined render; wait for that hydration before asserting on tiles.
  const c = harness.activeClient as { setEvents: ReturnType<typeof vi.fn> };
  await waitFor(() => expect(c.setEvents).toHaveBeenCalled());
}

describe('joined room layout', () => {
  it('keeps the local camera preview bound to the same stream when the mic toggles', async () => {
    vi.stubGlobal('MediaStream', FakeMediaStream);
    harness.localCamera = new FakeMediaStreamTrack('video');
    await renderJoined();
    const video = () => screen.getByTestId('video-grid').querySelector('video') as HTMLVideoElement;
    await waitFor(() => expect(video().srcObject).toBeTruthy());
    const before = video().srcObject;
    const c = harness.activeClient as { setEvents: ReturnType<typeof vi.fn> };
    const events = c.setEvents.mock.calls.at(-1)![0] as { onLocalTracksChange: (l: object) => void };
    act(() => events.onLocalTracksChange({ mic: true, camera: true, screen: false }));
    act(() => events.onLocalTracksChange({ mic: false, camera: true, screen: false }));
    expect(video().srcObject).toBe(before);
  });

  it('shows audio-only participants as tiles and counts everyone in the header', async () => {
    harness.participants = [A, B];
    await renderJoined();
    const strip = screen.getByTestId('audio-participants');
    expect(within(strip).getAllByTestId('voice-participant')).toHaveLength(3);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByTestId('voice-room-header')).toHaveTextContent('3');
    expect(screen.queryByTestId('video-grid')).toBeNull();
  });

  it('puts camera senders in the grid and the rest in the audio strip', async () => {
    harness.participants = [A, B];
    harness.remoteTracks = [remote(A, 'camera'), remote(B, 'audio')];
    await renderJoined();
    const grid = screen.getByTestId('video-grid');
    expect(within(grid).getAllByTestId('video-tile')).toHaveLength(1);
    expect(within(grid).getByText('Ada')).toBeInTheDocument();
    const strip = screen.getByTestId('audio-participants');
    expect(within(strip).getAllByTestId('voice-participant')).toHaveLength(2);
    expect(screen.queryByTestId('screen-share-area')).toBeNull();
  });

  it('gives a screen share the stage and moves everyone else to the rail', async () => {
    harness.participants = [A, B];
    harness.remoteTracks = [remote(A, 'screen'), remote(B, 'camera')];
    await renderJoined();
    const stage = screen.getByTestId('screen-share-area');
    expect(stage).toHaveTextContent('Ada is presenting');
    expect(screen.queryByTestId('video-grid')).toBeNull();
    // Rail: Ben's camera tile plus audio tiles for me and Ada.
    expect(screen.getAllByTestId('video-tile')).toHaveLength(1);
    expect(screen.getAllByTestId('voice-participant')).toHaveLength(2);
  });

  it('pins a camera to the stage from its tile and unpins from the stage control', async () => {
    harness.participants = [A];
    harness.remoteTracks = [remote(A, 'camera')];
    await renderJoined();
    fireEvent.click(screen.getByTestId('video-tile'));
    const stage = screen.getByTestId('video-stage');
    expect(stage).toHaveTextContent('Ada');
    fireEvent.click(within(stage).getByRole('button', { name: /^pinned$/i }));
    expect(screen.queryByTestId('video-stage')).toBeNull();
    expect(screen.getByTestId('video-grid')).toBeInTheDocument();
  });

  it('mute-for-me is offered for remote tiles only and toggles the store', async () => {
    harness.participants = [A];
    await renderJoined();
    const buttons = screen.getAllByTestId('mute-for-me');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(useVoiceStore.getState().localMutedPubkeys[A]).toBe(true);
    // The store update reaches the tile through useSyncExternalStore; the
    // re-render is not guaranteed to be synchronous with the click.
    await waitFor(() => expect(buttons[0]).toHaveAttribute('data-muted', 'true'));
    fireEvent.click(buttons[0]);
    expect(useVoiceStore.getState().localMutedPubkeys[A]).toBeUndefined();
    await waitFor(() => expect(buttons[0]).toHaveAttribute('data-muted', 'false'));
  });

  it('the quality dot follows the peer sample in the store', async () => {
    harness.participants = [A];
    await renderJoined();
    expect(screen.getByTestId('peer-quality-dot')).toHaveAttribute('data-quality', 'unknown');
    useVoiceStore.getState().setPeerQuality(A, {
      level: 'poor', rttMs: 600, loss: 0.1, jitterMs: 90, outboundVideoBps: null, outboundFps: null, qualityLimitationReason: null,
    });
    expect(await screen.findByTestId('peer-quality-dot')).toHaveAttribute('data-quality', 'poor');
  });

  it('lights the speaking ring from the store', async () => {
    harness.participants = [A];
    await renderJoined();
    const tile = screen.getAllByTestId('voice-participant').find((el) => el.textContent?.includes('Ada'))!;
    expect(tile.className).not.toContain('ring-lc-green');
    useVoiceStore.getState().setSpeaking(A, true);
    await screen.findByText('Ada');
    expect(tile.className).toContain('ring-lc-green');
  });

  it('shows the mesh syncing pill while a peer connection is not yet connected', async () => {
    harness.participants = [A];
    (harness.activeClient as { getPeerConnectionStates: () => Record<string, string> }).getPeerConnectionStates = () => ({ [A]: 'connecting' });
    await renderJoined();
    expect(screen.getByTestId('mesh-sync-status')).toBeInTheDocument();
    expect(screen.queryByTestId('sfu-status')).toBeNull();
  });
});
