import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import type { GameSession } from '@/lib/games/session/session';
import { useWinnerLabel } from '@/hooks/games/card/useWinnerLabel';

const CH = 'channel-1';
const B = 'b'.repeat(64);

const session = (seats: GameSession['seats']) =>
  ({ id: 'g1', channelId: CH, status: 'finished', winner: B, seats } as unknown as GameSession);

const mount = (s: GameSession, winner: string) => renderHook(() => useWinnerLabel(s, winner), {
  wrapper: bridgeWrapper(fakeBridge({
    membersByGroup: { [CH]: [B] },
    userMetadata: { [B]: userMetadataFixture({ pubkey: B, displayName: 'Bea' }) },
  }, { ensureUserMetadata: async () => {} } as never)),
});

describe('useWinnerLabel', () => {
  it('names the winner by their profile in the channel', () => {
    expect(mount(session([{ id: B, by: B }]), B).result.current).toBe('🏆 Bea won');
  });

  it('names a hot-seat winner by the label the table gave the seat', () => {
    const hot = session([{ id: `${B}#1`, by: B, label: 'Beto' }]);
    expect(mount(hot, `${B}#1`).result.current).toBe('🏆 Beto won');
  });
});
