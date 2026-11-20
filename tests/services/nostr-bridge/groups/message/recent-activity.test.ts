import { afterEach, expect, it, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import { catchUpChannelActivity } from '@/services/nostr-bridge/groups/message/recent-activity';
import type { PingsContext } from '@/services/nostr-bridge/groups/message/pings';
import { getChannelPref, useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';

const relay = 'wss://migration.test';
const owner = 'a'.repeat(64);

afterEach(() => useChannelPrefsStore.getState().reset());

it('recovers historical participation and ranks it using the latest message by any author', async () => {
  const session = { pubKeyHex: owner };
  const groups = ['parent', 'posted', 'tagged', 'unfollowed', 'retry'].map((id) => (
    groupFixture({ id, parent: id === 'parent' ? undefined : 'parent' })
  ));
  const old = 100;
  const latest = 200;
  const message = (id: string, pubkey: string, created_at: number, tags: string[][] = []) => ({
    kind: 9, pubkey, created_at, tags: [['h', id], ...tags],
  }) as Event;
  const queryRelaysWithConfidence = vi.fn(async (_relays: string[], filter: Filter) => {
    const id = filter['#h']?.[0];
    if (id === 'retry') return { complete: false, events: [] };
    if (!id) return { complete: true, events: [] };
    const events = filter.authors
      ? (id === 'posted' ? [message(id, owner, old)] : [])
      : filter['#p']
        ? (id === 'tagged' ? [message(id, 'other', old, [['p', owner]])] : [])
        : [message(id, 'other', latest)];
    return { complete: true, events };
  });
  const ctx = {
    session: () => session,
    currentRelayUrl: { get: () => relay },
    messagesByGroup: { get: () => ({}) },
    groups: { get: () => groups },
    queryRelaysWithConfidence,
  } as unknown as PingsContext;
  useChannelPrefsStore.getState().setFollowing(relay, 'unfollowed', false);
  await catchUpChannelActivity(ctx, relay);
  for (const id of ['posted', 'tagged']) {
    expect(getChannelPref(relay, id)).toMatchObject({ followed: true, latestMessageAt: latest });
  }
  expect(getChannelPref(relay, 'unfollowed').unfollowed).toBe(true);
  expect(getChannelPref(relay, 'retry').historyChecked).toBeUndefined();
  expect(queryRelaysWithConfidence.mock.calls.map(([, filter]) => filter['#h']?.[0]))
    .not.toContain('parent');
});
