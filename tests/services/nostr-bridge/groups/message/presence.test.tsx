import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { MessagesModule, type MessagesContext } from '@/services/nostr-bridge/groups/message/module';
import { PingsModule, type PingsContext, type PingsDeps } from '@/services/nostr-bridge/groups/message/pings';
import { MessagesState } from '@/services/nostr-bridge/groups/message/state';
import { useMemberList } from '@/hooks/chat/members/useMemberList';
import { useMemberListScreen } from '@/hooks/shell/mobile/screens/channel/useMemberListScreen';
import { useChatStore } from '@/store/chat';
import { presenceActivityKey } from '@/utils/chat/members/presence';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

// No auxiliary activity subscription: accepted message traffic must suffice.
vi.mock('@/hooks/chat/members/useNostrPresence', () => ({ useNostrPresence: () => {} }));

const RELAY = 'wss://presence.test';
const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const NOW = 1_800_000_000_000;
const event = (pubkey = ME, createdAt = NOW / 1000): NostrEvent => ({
  id: 'confirmed', pubkey, kind: 9, content: 'hello', tags: [['h', 'room']], created_at: createdAt, sig: '',
});

function setup() {
  const bridge = fakeBridge({
    currentRelayUrl: RELAY, myPubkey: ME, groups: [groupFixture({ id: 'room' })],
  }, { ensureUserMetadata: vi.fn() });
  const session = { pubKeyHex: ME, loginMethod: 'nsec' as const, relayUrl: RELAY };
  let accept!: (value: NostrEvent) => void;
  let reject!: (reason: Error) => void;
  const signAndPublish = vi.fn(() => new Promise<NostrEvent>((resolve, refuse) => { accept = resolve; reject = refuse; }));
  const ctx = {
    session: () => session, currentRelayUrl: bridge.stores.currentRelayUrl,
    groups: bridge.stores.groups, signAndPublish,
  } as unknown as MessagesContext;
  const state = new MessagesState();
  state.messagesByGroup.subscribe((messages) => bridge.stores.messagesByGroup.set(messages));
  const messages = new MessagesModule(state, ctx, {
    waitForRelayAuth: async () => 'ok',
    moderation: { isModerated: () => false, isDeletedByAuthor: () => false, ingestEventDeletion: vi.fn(), ingestGroupEventDeletion: vi.fn() },
    pings: { recordRelayUse: vi.fn(), deliverGroupPing: vi.fn() },
    ensureUserMetadata: vi.fn(),
  });
  const hooks = renderHook(() => ({ desktop: useMemberList('room'), mobile: useMemberListScreen('room') }), { wrapper: bridgeWrapper(bridge) });
  return { ...hooks, messages, state, ctx, accept: (ev = event()) => accept(ev), reject: () => reject(new Error('relay rejected')) };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  useChatStore.getState().reset();
});
afterEach(() => vi.useRealTimers());

describe('confirmed message presence', () => {
  it('shows the sender online in both shells after ACK without membership or auxiliary echoes', async () => {
    const { messages, result, accept } = setup();
    await act(async () => { await messages.sendMessage('room', 'hello'); });
    expect(result.current.mobile.total).toBe(0);
    expect(useChatStore.getState().lastActivityAt).toEqual({});
    await act(async () => accept());
    expect(result.current.mobile.total).toBe(1);
    expect(result.current.mobile.onlineCount).toBe(1);
    expect(result.current.mobile.isOnline(ME)).toBe(true);
    expect(result.current.desktop.onlineGroups.flatMap((group) => group.members).map((member) => member.pubkey)).toEqual([ME]);
    expect(useChatStore.getState().lastActivityAt[presenceActivityKey(RELAY, ME)]).toBe(NOW);
    expect(useChatStore.getState().lastActivityAt[presenceActivityKey('wss://other.test', ME)]).toBeUndefined();
  });

  it('does not make an optimistic or rejected sender online', async () => {
    const { messages, result, reject, state } = setup();
    await act(async () => { await messages.sendMessage('room', 'hello'); });
    expect(result.current.desktop.onlineGroups).toEqual([]);
    await act(async () => reject());
    expect(state.messagesByGroup.get().room[0].failed).toBe(true);
    expect(result.current.mobile.total).toBe(0);
    expect(result.current.mobile.onlineCount).toBe(0);
    expect(useChatStore.getState().lastActivityAt).toEqual({});
  });

  it('records received authors from normal message ingest without the auxiliary subscription', () => {
    const { messages, result } = setup();
    act(() => messages.ingest('room', event(OTHER)));
    expect(result.current.mobile.onlineCount).toBe(1);
    expect(result.current.desktop.onlineGroups.flatMap((group) => group.members).map((member) => member.pubkey)).toEqual([OTHER]);
    act(() => messages.ingest('room', event(OTHER)));
    expect(result.current.mobile.total).toBe(1);
  });

  it('keeps historical message authors offline and expires current authors on the presence tick', () => {
    const { messages, result } = setup();
    act(() => messages.ingest('room', event(OTHER, NOW / 1000 - 3600)));
    expect(result.current.mobile.onlineCount).toBe(0);
    expect(result.current.desktop.onlineGroups).toEqual([]);
    act(() => messages.ingest('room', { ...event(ME), id: 'new' }));
    expect(result.current.mobile.onlineCount).toBe(1);
    act(() => {
      vi.setSystemTime(NOW + 3600_000);
      useChatStore.getState().bumpPresenceTick();
    });
    expect(result.current.mobile.onlineCount).toBe(0);
    expect(result.current.desktop.onlineGroups).toEqual([]);
  });

  it('records ordinary relay-wide message activity even when the channel stream owns rendering', () => {
    const { ctx } = setup();
    const pings = new PingsModule(ctx as unknown as PingsContext, { hasOwnMessageStream: () => true } as unknown as PingsDeps);
    pings.ingestPing('wss://elsewhere.test', event(OTHER), 'active');
    expect(useChatStore.getState().lastActivityAt).toEqual({});
    pings.ingestPing(RELAY, event(OTHER), 'active');
    expect(useChatStore.getState().lastActivityAt[presenceActivityKey(RELAY, OTHER)]).toBe(NOW);
  });

  it('ignores non-message events instead of treating them as member activity', () => {
    const { messages, result } = setup();
    act(() => messages.ingest('room', { ...event(OTHER), kind: 7 }));
    expect(useChatStore.getState().lastActivityAt).toEqual({});
    expect(result.current.mobile.total).toBe(0);
  });

  it('ignores an ACK after switching relays', async () => {
    const { messages, state, ctx, accept } = setup();
    await act(async () => { await messages.sendMessage('room', 'hello'); });
    act(() => {
      state.pendingSends.clear();
      state.messagesByGroup.set({});
      ctx.currentRelayUrl.set('wss://other.test');
    });
    await act(async () => accept());
    expect(useChatStore.getState().lastActivityAt).toEqual({});
  });
});
