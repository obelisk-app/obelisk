/**
 * The sidebar fan-out: every channel row calls `useCachedChannelHighlights`.
 * A new message in one channel must re-render that channel's row and no
 * other. Before the per-group subscription each row subscribed to the whole
 * messages-by-group map, so one message re-rendered every row.
 *
 * The bridge is replaced at its client module by a fake whose
 * `subscribeMessagesByGroup` is backed by the bridge's own `StateStore`, so
 * subscribe-with-replay and same-value suppression behave as in the app.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StateStore } from '@/services/nostr-bridge/state-store';
import type { JsMessage } from '@/services/nostr-bridge/types';

const byGroup = new StateStore<Record<string, JsMessage[]>>({});
const bridgeSubs = { opened: 0, closed: 0 };

vi.mock('@/services/nostr-bridge/client', () => ({
  getBridge: () => Promise.resolve({
    subscribeMessagesByGroup: (cb: (v: Record<string, JsMessage[]>) => void) => {
      bridgeSubs.opened++;
      const off = byGroup.subscribe(cb);
      return () => { bridgeSubs.closed++; off(); };
    },
  }),
}));

const { useCachedChannelHighlights } = await import('@/services/read-state/selectors');
const { useReadStateStore } = await import('@/store/read-state');

const ME = 'me'.padEnd(64, '0');
const ROWS = 20;
const ids = Array.from({ length: ROWS }, (_, i) => `group-${i}`);
const renders = new Map<string, number>();

function msg(id: string, createdAt: number, mentions: string[] = []): JsMessage {
  return { id, pubkey: 'someone', content: 'hi', createdAt, kind: 9, replyToId: null, mentions };
}

function Row({ groupId }: { groupId: string }) {
  renders.set(groupId, (renders.get(groupId) ?? 0) + 1);
  const h = useCachedChannelHighlights(groupId, ME);
  return <span data-testid={groupId}>{`${h.unread}/${h.mentions}`}</span>;
}

function Sidebar() {
  return <>{ids.map((id) => <Row key={id} groupId={id} />)}</>;
}

async function mountSidebar() {
  const view = render(<Sidebar />);
  await act(async () => {}); // the bridge promise resolves and every row subscribes
  return view;
}

beforeEach(() => {
  renders.clear();
  bridgeSubs.opened = 0;
  bridgeSubs.closed = 0;
  // Cursor 1 ms: every message below counts as unread, with no clock involved.
  useReadStateStore.setState({ groupCursors: Object.fromEntries(ids.map((id) => [id, 1])) });
  byGroup.set(Object.fromEntries(ids.map((id) => [id, [msg(`${id}-first`, 100)]])));
});

describe('useCachedChannelHighlights render fan-out', () => {
  it(`one new message re-renders exactly one of ${ROWS} rows`, async () => {
    await mountSidebar();
    expect(screen.getByTestId('group-7')).toHaveTextContent('1/0');
    renders.clear();

    act(() => {
      byGroup.update((prev) => ({ ...prev, 'group-7': [...prev['group-7'], msg('new', 200, [ME])] }));
    });

    expect(screen.getByTestId('group-7')).toHaveTextContent('2/1');
    expect(Object.fromEntries(renders)).toEqual({ 'group-7': 1 });
  });

  it('a message for a channel no row shows re-renders nothing', async () => {
    await mountSidebar();
    renders.clear();
    act(() => {
      byGroup.update((prev) => ({ ...prev, elsewhere: [msg('x', 300)] }));
    });
    expect(renders.size).toBe(0);
  });

  it('a row whose channel has no messages yet shows nothing, then picks up its first message', async () => {
    byGroup.set({});
    await mountSidebar();
    expect(screen.getByTestId('group-3')).toHaveTextContent('0/0');
    act(() => {
      byGroup.update((prev) => ({ ...prev, 'group-3': [msg('a', 100)] }));
    });
    expect(screen.getByTestId('group-3')).toHaveTextContent('1/0');
  });

  it(`all ${ROWS} rows share one bridge subscription, closed when the last row unmounts`, async () => {
    const view = await mountSidebar();
    expect(bridgeSubs).toEqual({ opened: 1, closed: 0 });
    view.unmount();
    expect(bridgeSubs).toEqual({ opened: 1, closed: 1 });
  });

  it('a sidebar that unmounts before the bridge is ready never subscribes', async () => {
    const view = render(<Sidebar />);
    view.unmount();
    await act(async () => {});
    expect(bridgeSubs).toEqual({ opened: 0, closed: 0 });
  });
});
