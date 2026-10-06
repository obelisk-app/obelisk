/**
 * VoiceRoom's ownership of the call across effect cancellation and a failing
 * leave. Both cases were red before their fix (round 7 audit, F8 and F9).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import VoiceRoom from '@/components/voice/VoiceRoom';
import { useVoiceStore } from '@/store/voice';
import { LocaleProvider } from '@/i18n/context';

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

type FakeClient = {
  channelId: string;
  isJoined: () => boolean;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  setEvents: ReturnType<typeof vi.fn>;
  setExpectSfu: ReturnType<typeof vi.fn>;
  setPassiveParticipantHints: ReturnType<typeof vi.fn>;
  getParticipants: () => string[];
  getRemoteTracks: () => never[];
  getPeerConnectionStates: () => Record<string, never>;
  getLocalTracks: () => { mic: null; camera: null; screen: null };
};

const harness = vi.hoisted(() => ({
  activeClient: null as FakeClient | null,
  /** Resolved by the test to let the pending join() finish. */
  releaseJoin: null as (() => void) | null,
  leaveError: null as Error | null,
  setActiveVoiceClient: vi.fn((client: FakeClient | null) => { harness.activeClient = client; }),
  built: [] as FakeClient[],
}));

function makeClient(channelId: string): FakeClient {
  return {
    channelId,
    isJoined: () => true,
    join: vi.fn(() => new Promise<void>((resolve) => { harness.releaseJoin = resolve; })),
    leave: vi.fn(async () => { if (harness.leaveError) throw harness.leaveError; }),
    setEvents: vi.fn(),
    setExpectSfu: vi.fn(),
    setPassiveParticipantHints: vi.fn(),
    getParticipants: () => [],
    getRemoteTracks: () => [],
    getPeerConnectionStates: () => ({}),
    getLocalTracks: () => ({ mic: null, camera: null, screen: null }),
  };
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/marketing/ShootingStars', () => ({ default: () => null }));
vi.mock('@/components/voice/VoiceControls', () => ({
  default: ({ onLeave }: { onLeave: () => void }) => (
    <button data-testid="leave-btn" onClick={() => { void onLeave(); }}>leave</button>
  ),
}));
vi.mock('@/components/voice/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('@/services/voice/sfu-control', () => ({ ensureSfuRoomStarted: vi.fn(async () => null) }));
vi.mock('@/services/voice/active-client', () => ({
  getActiveVoiceClient: () => harness.activeClient,
  setActiveVoiceClient: harness.setActiveVoiceClient,
}));
vi.mock('@/services/voice/client', () => ({
  VoiceClient: vi.fn().mockImplementation(function VoiceClientMock(channelId: string) {
    const client = makeClient(channelId);
    harness.built.push(client);
    return client;
  }),
}));
vi.mock('@/services/nostr-bridge', () => ({
  getBridge: async () => ({
    getPublicKey: () => 'me-pubkey',
    subscribeGroups: (cb: (g: unknown[]) => void) => { cb([{ id: 'old-voice', kind: 'voice', isOpen: true }, { id: 'new-voice', kind: 'voice', isOpen: true }]); return vi.fn(); },
    subscribeMembers: (_c: string, cb: (m: readonly string[]) => void) => { cb([]); return vi.fn(); },
    subscribeAdmins: (_c: string, cb: (a: readonly string[]) => void) => { cb([]); return vi.fn(); },
    subscribeMembershipReady: (_c: string, cb: (r: boolean) => void) => { cb(true); return vi.fn(); },
  }),
  useGroups: () => [
    { id: 'old-voice', name: 'Old Voice', kind: 'voice', isOpen: true },
    { id: 'new-voice', name: 'New Voice', kind: 'voice', isOpen: true },
  ],
  useCurrentRelayUrl: () => 'wss://relay.test',
  useMyLoginMethod: () => 'nsec',
  useUserMetadata: () => null,
  useActiveCall: () => null,
}));

beforeEach(() => {
  harness.activeClient = null;
  harness.releaseJoin = null;
  harness.leaveError = null;
  harness.built.length = 0;
  harness.setActiveVoiceClient.mockClear();
  useVoiceStore.getState().leaveVoice();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VoiceRoom call ownership', () => {
  it('records the live call in the store even when the user navigated away before join() settled', async () => {
    const { rerender } = renderLocalized(<VoiceRoom channelId="old-voice" channelName="Old Voice" />);
    fireEvent.click(await screen.findByTestId('join-voice-btn'));
    await waitFor(() => expect(harness.built.length).toBe(1));
    expect(useVoiceStore.getState().isConnecting).toBe(true);

    // The relay has not answered yet; the user opens another channel.
    rerender(<LocaleProvider initialLocale="en"><VoiceRoom channelId="new-voice" channelName="New Voice" /></LocaleProvider>);
    expect(await screen.findByTestId('join-voice-btn')).toBeInTheDocument();

    // Now the join lands. The call is live and registered as the active
    // client, so the store must say so or the status bar never renders a
    // Leave button for it.
    harness.releaseJoin?.();
    await waitFor(() => expect(useVoiceStore.getState().currentVoiceChannelId).toBe('old-voice'));
    expect(useVoiceStore.getState().currentVoiceRelayUrl).toBe('wss://relay.test');
    expect(useVoiceStore.getState().isConnecting).toBe(false);
    expect(harness.activeClient).toBe(harness.built[0]);
  });

  it('clears the call from the store and the active slot even when client.leave() rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const active = makeClient('old-voice');
    harness.activeClient = active;
    harness.leaveError = new Error('relay hung');
    useVoiceStore.setState({ currentVoiceChannelId: 'old-voice', currentVoiceRelayUrl: 'wss://relay.test' });

    renderLocalized(<VoiceRoom channelId="old-voice" channelName="Old Voice" />);
    fireEvent.click(await screen.findByTestId('leave-btn'));

    await waitFor(() => expect(active.leave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull());
    expect(harness.setActiveVoiceClient).toHaveBeenCalledWith(null);
    expect(await screen.findByTestId('join-voice-btn')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('[voice] leave failed; the call was dropped locally anyway', expect.any(Error));
  });
});
