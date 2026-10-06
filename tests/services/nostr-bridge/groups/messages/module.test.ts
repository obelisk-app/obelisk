/**
 * The messages module on a fake context: one REQ per channel, the empty-EOSE
 * ladder's three restarts and its last query, the queue's cap and the
 * active channel's priority, the optimistic send settling, and the
 * lifecycle hooks the resets call. `bridge.test.ts` covers the same paths
 * through the facade; these pin the module boundary itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { MessagesModule, type MessagesContext } from '@/services/nostr-bridge/groups/messages/module';
import { MAX_BACKGROUND_MESSAGE_STREAMS, MessagesState } from '@/services/nostr-bridge/groups/messages/state';
import { StateStore } from '@/services/nostr-bridge/state-store';
import type { TrackedSub } from '@/services/nostr-bridge/context';
import type { JsGroup, RelayAccessState } from '@/services/nostr-bridge/types';

const RELAY = 'wss://r.example';
const ME = 'a'.repeat(64);

interface Req { filter: Filter; onevent: (ev: NostrEvent) => void; oneose?: () => void; closed: boolean }

function setup() {
  const reqs: Req[] = [];
  const queries: Filter[] = [];
  const published: Array<{ kind: number; tags: string[][]; content: string; created_at: number }> = [];
  let publishFails = false;
  const ctx: MessagesContext = {
    session: () => ({ pubKeyHex: ME, loginMethod: 'nsec', relayUrl: RELAY }),
    relays: () => [RELAY],
    currentRelayUrl: new StateStore(RELAY),
    relayAccess: new StateStore<Record<string, RelayAccessState>>({ [RELAY]: 'ok' }),
    groups: new StateStore<JsGroup[]>([]),
    subscribeWatched: (_relays, filter, onevent, oneose) => {
      const req: Req = { filter, onevent, oneose, closed: false };
      reqs.push(req);
      return { close: () => { req.closed = true; }, setPriority: vi.fn() } satisfies TrackedSub;
    },
    track: vi.fn(),
    untrack: vi.fn(),
    queryRelaysWithConfidence: async (_relays, filter) => { queries.push(filter); return { events: [], complete: true }; },
    signAndPublish: async (template) => {
      if (publishFails) throw new Error('blocked');
      published.push(template);
      return { ...template, id: `id-${published.length}`, pubkey: ME, sig: 's' };
    },
  };
  const state = new MessagesState();
  const m = new MessagesModule(state, ctx, {
    waitForRelayAuth: async () => 'ok',
    moderation: { isModerated: () => false, isDeletedByAuthor: () => false, ingestEventDeletion: vi.fn(), ingestGroupEventDeletion: vi.fn() },
    pings: { recordRelayUse: vi.fn(), deliverGroupPing: vi.fn() },
    ensureUserMetadata: vi.fn(),
  });
  return { m, state, reqs, queries, published, failPublish: (v: boolean) => { publishFails = v; } };
}

const msg = (id: string, createdAt = 10, content = id): NostrEvent => ({ id, pubkey: 'b'.repeat(64), kind: 9, created_at: createdAt, content, tags: [['h', 'g']], sig: '' });

describe('groups/messages', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens one REQ per channel and promotes an empty channel only after three restarts and a last query', async () => {
    const { m, state, reqs, queries } = setup();
    m.stream.subscribe('g');
    m.stream.subscribe('g');
    expect(reqs).toHaveLength(1);
    expect(state.messagesStatusByGroup.get().g).toBe('loading');
    for (const delay of [1500, 3000, 5000]) {
      reqs.at(-1)!.oneose?.();
      expect(state.messagesStatusByGroup.get().g).toBe('empty-unconfirmed');
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(reqs).toHaveLength(4);
    expect(reqs.slice(0, 3).every((r) => r.closed)).toBe(true);
    reqs.at(-1)!.oneose?.();
    expect(state.messagesStatusByGroup.get().g).toBe('empty-confirmed');
    expect(queries).toHaveLength(1);
    expect(m.retry.attempts('g')).toBeNull();
  });

  it('a message cancels the ladder and settles the channel', () => {
    const { m, state, reqs } = setup();
    m.stream.subscribe('g');
    reqs[0].oneose?.();
    expect(m.retry.attempts('g')).toBe(0);
    reqs[0].onevent(msg('m1'));
    expect(state.messagesStatusByGroup.get().g).toBe('has-messages');
    expect(m.retry.attempts('g')).toBeNull();
    expect(state.messagesByGroup.get().g.map((x) => x.id)).toEqual(['m1']);
  });

  it('queues background channels, caps them, and lets the active channel jump the queue', () => {
    const { m, state, reqs } = setup();
    m.queue.setActiveGroup('active');
    for (let i = 0; i < MAX_BACKGROUND_MESSAGE_STREAMS + 3; i++) m.queue.queue(`bg${i}`);
    m.queue.queue('active');
    expect(reqs.map((r) => r.filter['#h']?.[0])).toEqual(['active']);
    reqs[0].oneose?.();
    vi.advanceTimersByTime(80);
    vi.advanceTimersByTime(80);
    vi.advanceTimersByTime(80);
    const background = [...state.subscribedGroups].filter((g) => g !== 'active');
    expect(background).toHaveLength(MAX_BACKGROUND_MESSAGE_STREAMS);
  });

  it('paints a sent message at once, replaces it with the published event, and marks a refusal failed', async () => {
    const { m, state, published, failPublish } = setup();
    void m.sendMessage('g', 'hello');
    expect(state.messagesByGroup.get().g[0]).toMatchObject({ pending: true, content: 'hello' });
    await vi.runAllTimersAsync();
    expect(published).toHaveLength(1);
    expect(state.messagesByGroup.get().g).toEqual([expect.objectContaining({ id: 'id-1', content: 'hello' })]);
    failPublish(true);
    await m.sendMessage('g', 'again');
    await vi.runAllTimersAsync();
    const failed = state.messagesByGroup.get().g.find((x) => x.content === 'again');
    expect(failed).toMatchObject({ failed: true, pending: false });
  });

  it('the lifecycle hooks clear exactly their share of the state', () => {
    const { m, state } = setup();
    m.queue.setActiveGroup('g');
    m.stream.subscribe('g');
    const hooks = m.lifecycle();
    expect(hooks.subscribedGroups()).toEqual(['g']);
    expect(hooks.activeGroupId()).toBe('g');
    hooks.forgetSubscriptions();
    hooks.resetStatus();
    hooks.clearTimers();
    hooks.clearActiveGroup();
    expect(state.subscribedGroups.size).toBe(0);
    expect(state.messagesStatusByGroup.get()).toEqual({});
    expect(state.priorityDeadline).toBe(0);
    expect(state.activeGroupId).toBeNull();
  });
});
