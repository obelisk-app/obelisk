import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthGate } from '@/components/voice/room/useVoiceRoomGate';

const ME = 'me';

vi.mock('@/services/nostr-bridge', () => ({
  getBridge: async () => ({
    getPublicKey: () => ME,
    // Room A is open; room B is closed and has not loaded its member list.
    subscribeGroups: (cb: (g: unknown[]) => void) => {
      cb([{ id: 'A', isOpen: true }, { id: 'B', isOpen: false }]);
      return () => {};
    },
    subscribeMembers: (_c: string, cb: (m: readonly string[]) => void) => { cb([]); return () => {}; },
    subscribeAdmins: (_c: string, cb: (a: readonly string[]) => void) => { cb([]); return () => {}; },
    subscribeMembershipReady: (_c: string, cb: (r: boolean) => void) => { cb(false); return () => {}; },
  }),
}));

import { useVoiceRoomGate } from '@/components/voice/room/useVoiceRoomGate';

describe('useVoiceRoomGate', () => {
  it('admits an open room', async () => {
    const ref = { current: null };
    const { result } = renderHook(() => useVoiceRoomGate('A', ref, vi.fn()));
    await waitFor(() => expect(result.current.gate.phase).toBe('ready'));
    expect(result.current.selfPubkey).toBe(ME);
  });

  it('never shows the previous room\'s verdict for the next room, not even for one render', async () => {
    const ref = { current: null };
    const seen: { channelId: string; gate: AuthGate }[] = [];
    const { result, rerender } = renderHook(({ channelId }) => {
      const out = useVoiceRoomGate(channelId, ref, vi.fn());
      seen.push({ channelId, gate: out.gate });
      return out;
    }, { initialProps: { channelId: 'A' } });
    await waitFor(() => expect(result.current.gate.phase).toBe('ready'));

    rerender({ channelId: 'B' });
    const forB = seen.filter((r) => r.channelId === 'B');
    expect(forB.length).toBeGreaterThan(0);
    expect(forB.every((r) => r.gate.phase === 'loading-roles')).toBe(true);
  });
});
