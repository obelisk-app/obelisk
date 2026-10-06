import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthGate } from '@/hooks/voice/room/useVoiceRoomGate';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const ME = 'e'.repeat(64);

// Room A is open; room B is closed and has not loaded its member list.
const wrapper = bridgeWrapper(fakeBridge({
  myPubkey: ME,
  groups: [groupFixture({ id: 'A', isOpen: true }), groupFixture({ id: 'B', isOpen: false })],
  membershipReadyByGroup: {},
}));

/** Stable, as the store setter VoiceRoom passes is: a new one per render would re-run the gate. */
const setError = vi.fn();

import { useVoiceRoomGate } from '@/hooks/voice/room/useVoiceRoomGate';

describe('useVoiceRoomGate', () => {
  it('admits an open room', async () => {
    const ref = { current: null };
    const { result } = renderHook(() => useVoiceRoomGate('A', ref, setError), { wrapper });
    await waitFor(() => expect(result.current.gate.phase).toBe('ready'));
    expect(result.current.selfPubkey).toBe(ME);
  });

  it('never shows the previous room\'s verdict for the next room, not even for one render', async () => {
    const ref = { current: null };
    const seen: { channelId: string; gate: AuthGate }[] = [];
    const { result, rerender } = renderHook(({ channelId }) => {
      const out = useVoiceRoomGate(channelId, ref, setError);
      seen.push({ channelId, gate: out.gate });
      return out;
    }, { initialProps: { channelId: 'A' }, wrapper });
    await waitFor(() => expect(result.current.gate.phase).toBe('ready'));

    rerender({ channelId: 'B' });
    const forB = seen.filter((r) => r.channelId === 'B');
    expect(forB.length).toBeGreaterThan(0);
    expect(forB.every((r) => r.gate.phase === 'loading-roles')).toBe(true);
  });

  it('waits, loading, while there is no bridge (outside a provider, or before it has started)', async () => {
    const ref = { current: null };
    setError.mockClear();
    const { result } = renderHook(() => useVoiceRoomGate('A', ref, setError));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.gate.phase).toBe('loading-roles');
    expect(setError).not.toHaveBeenCalled();
  });
});
