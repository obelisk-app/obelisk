import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceRoom } from '@/hooks/voice/room/useVoiceRoom';
import { useVoiceStore } from '@/store/voice';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';

/** The gate and the client have their own suites; here they are stand-ins the test drives. */
const room = vi.hoisted(() => ({
  push: vi.fn(),
  joined: false,
  participants: [] as string[],
  gate: { phase: 'ready' } as { phase: string },
}));
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push: room.push }) }));
vi.mock('@/hooks/voice/room/useVoiceRoomGate', () => ({
  useVoiceRoomGate: () => ({ gate: room.gate, selfPubkey: 'me' }),
}));
vi.mock('@/hooks/voice/room/useVoiceRoomClient', () => ({
  useVoiceRoomClient: () => ({
    joined: room.joined,
    join: vi.fn(),
    leave: vi.fn(),
    participants: room.participants,
    remoteTracks: [],
    peerConnectionStates: {},
    local: { mic: false, camera: false, screen: false },
    localVideo: { camera: null, screen: null },
    sfuStatus: 'na',
  }),
}));

const render = (seed: Parameters<typeof fakeBridge>[0] = {}, name?: string) => renderHook(
  () => useVoiceRoom('room-id-0123456789abcdef', name),
  { wrapper: bridgeWrapper(fakeBridge({ groups: [groupFixture({ id: 'room-id-0123456789abcdef', kind: 'voice' })], ...seed })) },
);

beforeEach(() => {
  room.joined = false;
  room.participants = [];
  room.push.mockClear();
  useVoiceStore.setState({ currentVoiceChannelId: null });
});

describe('useVoiceRoom', () => {
  it('names the room and counts me in', () => {
    room.participants = ['a', 'b'];
    const { result } = render({}, 'Lounge');
    expect(result.current.displayName).toBe('Lounge');
    expect(render().result.current.displayName).toBe('room-id-01234567…');
    expect(result.current.totalCount).toBe(3);
  });

  it('counts the people already in the call before joining', () => {
    const { result } = render({
      activeCallByChannel: {
        'room-id-0123456789abcdef': { hostPubkey: 'h', status: 'open', participantCount: -1, participantPubkeys: ['a', 'b'], expiresAt: 0 } as never,
      },
    });
    expect(result.current.passiveCount).toBe(2);
    expect(result.current.passiveParticipantPubkeys).toEqual(['a', 'b']);
  });

  it('knows when the person is in another channel\'s call', () => {
    const { result } = render();
    expect(result.current.browsingWhileConnected).toBe(false);
    act(() => { useVoiceStore.setState({ currentVoiceChannelId: 'other' }); });
    expect(result.current.browsingWhileConnected).toBe(true);
  });

  it('lays a joined room out with me and my peers, and goes back to /app', () => {
    room.joined = true;
    room.participants = ['a'];
    const { result } = render();
    expect(result.current.stage).toMatchObject({ selfPubkey: 'me', activeStage: null, pinned: null });
    expect([...result.current.stage.videoPubkeys, ...result.current.stage.audioPubkeys].sort()).toEqual(['a', 'me']);
    result.current.back();
    expect(room.push).toHaveBeenCalledWith('/app');
  });
});
