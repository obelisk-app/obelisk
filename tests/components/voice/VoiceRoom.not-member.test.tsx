/**
 * The "not a member" panel: its one way out is the secondary pill Button.
 * The gate and the client are stubbed; this file is only about that panel.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';

const push = vi.fn();

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({ useRouter: () => ({ push }) }));
vi.mock('@/components/marketing/ShootingStars', () => ({ default: () => null }));
vi.mock('@/components/voice/VoiceControls', () => ({ default: () => null }));
vi.mock('@/components/voice/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('@/hooks/voice/room/useVoiceRoomGate', () => ({
  useVoiceRoomGate: () => ({ gate: { phase: 'not-a-member' }, selfPubkey: 'me' }),
}));
vi.mock('@/hooks/voice/room/useVoiceRoomClient', () => ({
  useVoiceRoomClient: () => ({
    joined: false,
    join: vi.fn(),
    leave: vi.fn(),
    participants: [],
    remoteTracks: [],
    peerConnectionStates: {},
    local: { mic: false, camera: false, screen: false },
    localVideo: { camera: null, screen: null },
    sfuStatus: null,
  }),
}));
vi.mock('@/services/nostr-bridge', () => ({
  useGroups: () => [{ id: 'room', name: 'Room', kind: 'voice', isOpen: false }],
  useCurrentRelayUrl: () => 'wss://relay.test',
  useMyLoginMethod: () => 'nsec',
  useUserMetadata: () => null,
  useActiveCall: () => null,
}));

import VoiceRoom from '@/components/voice/VoiceRoom';

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe('VoiceRoom, not a member', () => {
  it('offers Back as the secondary pill Button, which returns to the app', () => {
    render(<LocaleProvider initialLocale="en"><VoiceRoom channelId="room" channelName="Room" /></LocaleProvider>);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveClass('lc-pill-secondary', 'text-sm', 'mt-6');
    expect(back).toHaveAttribute('type', 'button');
    fireEvent.click(back);
    expect(push).toHaveBeenCalledWith('/app');
  });
});
