/**
 * `useSubscription` never paints the previous inputs' value (round 16,
 * re-audit item 8). Before the fix, switching a channel from A to B
 * rendered B's pane with A's messages for at least one frame: the hook's
 * state still held A's list until the new subscription replayed B's.
 * Every render is recorded here, so a single stale frame fails the test.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BridgeImpl } from '@/services/nostr-bridge/facade/client';
import type { JsMessage } from '@/services/nostr-bridge/common/types';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const byGroup: Record<string, JsMessage[]> = {};
const listeners = new Map<string, Set<(msgs: JsMessage[]) => void>>();

// A hand-built instance under the real provider: no module mock.
const bridge = {
  subscribeMessages: (groupId: string, cb: (msgs: JsMessage[]) => void) => {
    const set = listeners.get(groupId) ?? new Set();
    listeners.set(groupId, set);
    set.add(cb);
    cb(byGroup[groupId] ?? []);
    return () => set.delete(cb);
  },
} as unknown as BridgeImpl;
const wrapper = bridgeWrapper(bridge);

import { useMessages } from '@/services/nostr-bridge/hooks/messages';

const message = (id: string): JsMessage => ({
  id,
  pubkey: 'f'.repeat(64),
  content: id,
  createdAt: 1,
  kind: 9,
  replyToId: null,
  mentions: [],
});

describe('useSubscription', () => {
  it('switching channel A to B never renders a frame with A\'s messages', async () => {
    byGroup.A = [message('a1'), message('a2')];
    byGroup.B = [message('b1')];
    const frames: Array<{ groupId: string; ids: string[] }> = [];
    const { rerender } = renderHook(({ groupId }: { groupId: string }) => {
      const msgs = useMessages(groupId);
      frames.push({ groupId, ids: msgs.map((m) => m.id) });
      return msgs;
    }, { initialProps: { groupId: 'A' }, wrapper });
    await waitFor(() => expect(frames.at(-1)?.ids).toEqual(['a1', 'a2']));

    rerender({ groupId: 'B' });
    await waitFor(() => expect(frames.at(-1)?.ids).toEqual(['b1']));

    const underB = frames.filter((f) => f.groupId === 'B');
    expect(underB.length).toBeGreaterThan(0);
    for (const frame of underB) expect(frame.ids.some((id) => id.startsWith('a'))).toBe(false);
  });

  it('after the switch the old channel is unsubscribed and only the new one\'s updates paint', async () => {
    byGroup.A = [message('a1')];
    byGroup.B = [];
    const frames: Array<{ groupId: string; ids: string[] }> = [];
    const { rerender } = renderHook(({ groupId }: { groupId: string }) => {
      const msgs = useMessages(groupId);
      frames.push({ groupId, ids: msgs.map((m) => m.id) });
      return msgs;
    }, { initialProps: { groupId: 'A' }, wrapper });
    await waitFor(() => expect(frames.at(-1)?.ids).toEqual(['a1']));
    rerender({ groupId: 'B' });
    await waitFor(() => expect(listeners.get('B')?.size).toBe(1));
    expect(listeners.get('A')?.size).toBe(0);
    act(() => {
      for (const cb of listeners.get('B') ?? []) cb([message('b9')]);
    });
    expect(frames.at(-1)).toEqual({ groupId: 'B', ids: ['b9'] });
    expect(frames.filter((f) => f.groupId === 'B').every((f) => !f.ids.includes('a1'))).toBe(true);
  });
});
