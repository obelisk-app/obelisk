import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import VoiceRoom from '@/components/voice/VoiceRoom';
import { useVoiceStore } from '@/store/voice';
import type { ActiveCallInfo, JsUserMetadata } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

/** The slice of VoiceClient the room reaches; `join` only exists on a client the room built. */
type FakeClient = {
  channelId: string;
  isJoined: () => boolean;
  join?: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  setEvents: ReturnType<typeof vi.fn>;
  setExpectSfu: ReturnType<typeof vi.fn>;
  setPassiveParticipantHints: ReturnType<typeof vi.fn>;
  getParticipants: () => string[];
  getRemoteTracks: () => never[];
  getPeerConnectionStates: () => Record<string, never>;
  getLocalTracks: () => { mic: null; camera: null; screen: null };
};

/**
 * The real hooks over a fake bridge seeded from `bridgeHarness` at render
 * time (each test adjusts the harness first), in English.
 */
const renderLocalized = (ui: React.ReactElement) => renderWithBridge(ui, fakeBridge({
  myPubkey: 'me-pubkey',
  groups: bridgeHarness.groups.map((g) => groupFixture(g)),
  membershipReadyByGroup: Object.fromEntries(bridgeHarness.groups.map((g) => [g.id, true])),
  activeCallByChannel: bridgeHarness.activeCalls,
  userMetadata: Object.fromEntries(Object.entries(bridgeHarness.profiles)
    .map(([pubkey, meta]) => [pubkey, userMetadataFixture({ pubkey, ...meta })])),
}));


const voiceHarness = vi.hoisted(() => ({
  activeClient: null as FakeClient | null,
  joinError: null as Error | null,
  setActiveVoiceClient: vi.fn((client: FakeClient | null) => { voiceHarness.activeClient = client; }),
  voiceClientCtor: vi.fn(),
}));

const bridgeHarness = vi.hoisted(() => ({
  groups: [] as Array<{ id: string; name?: string; kind: 'voice' | 'voice-sfu'; isOpen?: boolean }>,
  activeCalls: {} as Record<string, ActiveCallInfo>,
  profiles: {} as Record<string, Partial<JsUserMetadata>>,
}));

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/components/marketing/ShootingStars', () => ({
  default: () => null,
}));

vi.mock('@/components/voice/VoiceControls', () => ({
  default: () => <div data-testid="voice-controls" />,
}));

vi.mock('@/components/voice/DebugOverlay', () => ({
  DebugOverlay: () => null,
}));

vi.mock('@/services/voice/sfu-control', () => ({
  ensureSfuRoomStarted: vi.fn(async () => null),
}));

vi.mock('@/services/voice/active-client', () => ({
  getActiveVoiceClient: () => voiceHarness.activeClient,
  setActiveVoiceClient: voiceHarness.setActiveVoiceClient,
}));

vi.mock('@/services/voice/client', () => ({
  VoiceClient: vi.fn().mockImplementation(function VoiceClientMock(channelId: string) {
    const client = {
      channelId,
      isJoined: () => true,
      join: vi.fn(async () => {
        if (voiceHarness.joinError) throw voiceHarness.joinError;
      }),
      leave: vi.fn(async () => {}),
      setEvents: vi.fn(),
      setExpectSfu: vi.fn(),
      setPassiveParticipantHints: vi.fn(),
      getParticipants: () => [],
      getRemoteTracks: () => [],
      getPeerConnectionStates: () => ({}),
      getLocalTracks: () => ({ mic: null, camera: null, screen: null }),
    };
    voiceHarness.voiceClientCtor(channelId);
    return client;
  }),
}));



function makeActiveClient(channelId: string) {
  return {
    channelId,
    isJoined: () => true,
    leave: vi.fn(async () => {}),
    setEvents: vi.fn(),
    setExpectSfu: vi.fn(),
    setPassiveParticipantHints: vi.fn(),
    getParticipants: () => [],
    getRemoteTracks: () => [],
    getPeerConnectionStates: () => ({}),
    getLocalTracks: () => ({ mic: null, camera: null, screen: null }),
  };
}

beforeEach(() => {
  bridgeHarness.groups = [
    { id: 'old-voice', name: 'Old Voice', kind: 'voice', isOpen: true },
    { id: 'new-voice', name: 'New Voice', kind: 'voice-sfu', isOpen: true },
  ];
  bridgeHarness.activeCalls = {};
  bridgeHarness.profiles = {};
  voiceHarness.activeClient = null;
  voiceHarness.joinError = null;
  voiceHarness.setActiveVoiceClient.mockClear();
  voiceHarness.voiceClientCtor.mockClear();
  useVoiceStore.setState({
    currentVoiceChannelId: null,
    currentVoiceRelayUrl: null,
    isMuted: true,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isConnecting: false,
    error: null,
    peerQuality: {},
    speakingPubkeys: {},
    localMutedPubkeys: {},
  });
});

afterEach(() => {
  cleanup();
});

describe('VoiceRoom join page', () => {
  it('does not leave the current call when browsing a different voice channel', async () => {
    const active = makeActiveClient('old-voice');
    voiceHarness.activeClient = active;
    useVoiceStore.setState({ currentVoiceChannelId: 'old-voice' });

    const { rerender } = renderLocalized(<VoiceRoom channelId="old-voice" channelName="Old Voice" />);
    expect(await screen.findByTestId('voice-controls')).toBeInTheDocument();

    rerender(<VoiceRoom channelId="new-voice" channelName="New Voice" />);
    const join = await screen.findByTestId('join-voice-btn');
    expect(join).toHaveClass('lc-pill-primary', 'text-sm', 'shadow-lg');
    expect(join).toHaveAttribute('type', 'button');

    expect(active.leave).not.toHaveBeenCalled();
    expect(voiceHarness.voiceClientCtor).not.toHaveBeenCalledWith('new-voice');
    expect(screen.getByText(/stay connected to your current call/i)).toBeInTheDocument();
  });

  it('passes detected mesh occupants into the media client immediately on join', async () => {
    bridgeHarness.activeCalls['old-voice'] = {
      hostPubkey: 'peer-a',
      status: 'active',
      participantCount: 2,
      expiresAt: Math.floor(Date.now() / 1000) + 90,
      createdAt: Math.floor(Date.now() / 1000),
      mode: 'mesh',
      participantPubkeys: ['me-pubkey', 'peer-a'],
    };

    renderLocalized(<VoiceRoom channelId="old-voice" channelName="Old Voice" />);

    fireEvent.click(await screen.findByTestId('join-voice-btn'));
    expect(await screen.findByTestId('voice-controls')).toBeInTheDocument();

    await waitFor(() => {
      expect(voiceHarness.activeClient?.setPassiveParticipantHints).toHaveBeenCalledWith(['me-pubkey', 'peer-a']);
    });
  });

  it('returns to the join page when relay signaling is rejected', async () => {
    voiceHarness.joinError = new Error('Relay rejected event: restricted: Access denied');
    renderLocalized(<VoiceRoom channelId="old-voice" channelName="Old Voice" />);

    fireEvent.click(await screen.findByTestId('join-voice-btn'));

    expect(await screen.findByTestId('join-voice-btn')).toBeInTheDocument();
    expect(screen.getByText('The relay refused the call. You may not have access on this relay.')).toBeInTheDocument();
    expect(voiceHarness.activeClient).toBeNull();
  });

  it('renders passive SFU or mesh occupants on the join page without connecting', async () => {
    bridgeHarness.activeCalls['new-voice'] = {
      hostPubkey: 'sfu-pubkey',
      status: 'active',
      participantCount: 2,
      expiresAt: Math.floor(Date.now() / 1000) + 90,
      createdAt: Math.floor(Date.now() / 1000),
      mode: 'sfu',
      participantPubkeys: ['peer-a', 'peer-b'],
    };
    bridgeHarness.profiles['peer-a'] = { displayName: 'Ada' };
    bridgeHarness.profiles['peer-b'] = { name: 'Ben' };

    renderLocalized(<VoiceRoom channelId="new-voice" channelName="New Voice" />);

    expect(await screen.findByTestId('join-voice-btn')).toBeInTheDocument();
    expect(screen.getByText('2 people are in this call.')).toBeInTheDocument();
    expect(screen.getByTestId('passive-call-roster')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(voiceHarness.voiceClientCtor).not.toHaveBeenCalled();
  });
});
