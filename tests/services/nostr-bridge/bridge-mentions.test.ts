/**
 * Mention and reply notifications on the pool-level fake.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { finalizeEvent, type Event as NostrEvent, type Filter } from 'nostr-tools';
import {
  deliver,
  fakeRelayMessage,
  fakeRelayMessageWithTags,
  flush,
  hexToBytesForTest,
  installBridgeHarness,
  makeKeypair,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);

describe('nostr-bridge', () => {

  describe('mention notifications', () => {
    // The bridge is the sole producer of mention cards. These lock in the
    // three rules the notification split is built on: mentions-only,
    // stamped with the active relay, and gated by the relay's cursor.
    async function loginAndSubscribe(groupId: string) {
      const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
      const { useNotificationsStore, NOTIFICATIONS_INITIAL } = await import('@/store/notifications');
      const { skHex, pkHex } = makeKeypair();
      const bridge = await getBridge();
      await bridge.loginWithNsec(skHex, pkHex);
      await flush();
      // Clear the first-connect floor stamped by finalizeLogin so the test
      // events (created "now") aren't dropped as backfill.
      useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
      bridge.subscribeMessages(groupId, () => {});
      await flush();
      return { bridge, impl: getBridgeImpl()!, skHex, pkHex, useNotificationsStore };
    }

    it('pushes a card for an explicit @-mention, stamped with the active relay', async () => {
      const groupId = 'notif-mention';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);

      deliver(await fakeRelayMessageWithTags({
        groupId,
        content: 'hey there',
        tags: [['p', pkHex]],
      }));
      await flush();

      const relay = impl.currentRelayUrl.get();
      const cards = useNotificationsStore.getState().mentionsByRelay[relay] ?? [];
      expect(cards).toHaveLength(1);
      expect(cards[0].relay).toBe(relay);
      expect(cards[0].channelId).toBe(groupId);
      expect(cards[0].preview).toBe('hey there');
    });

    it('pushes a reply card for a reply to my message, even without a p tag', async () => {
      const groupId = 'notif-reply';
      const { bridge, impl, useNotificationsStore } = await loginAndSubscribe(groupId);

      // My message first, so the reply's parent resolves to me.
      await bridge.sendMessage(groupId, 'mine');
      await flush();
      const mine = impl.messagesByGroup.get()[groupId]?.find((m) => m.content === 'mine');
      expect(mine).toBeTruthy();

      // No `p` tag: the parent is resolved from the local message list.
      deliver(await fakeRelayMessageWithTags({
        groupId,
        content: 'replying to you',
        tags: [['e', mine!.id, '', 'reply']],
      }));
      await flush();

      const relay = impl.currentRelayUrl.get();
      const cards = useNotificationsStore.getState().mentionsByRelay[relay] ?? [];
      expect(cards).toHaveLength(1);
      expect(cards[0].reason).toBe('reply');
      expect(cards[0].preview).toBe('replying to you');
    });

    it('still makes a card when the user is watching the channel (seen is decided on screen)', async () => {
      const groupId = 'notif-watching';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      const { useChatStore } = await import('@/store/chat');
      useChatStore.setState({ activeChannelId: groupId, isNearBottom: true });
      const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'look', tags: [['p', pkHex]] }));
      await flush();
      focus.mockRestore();
      const cards = useNotificationsStore.getState().mentionsByRelay[impl.currentRelayUrl.get()] ?? [];
      expect(cards).toHaveLength(1);
      expect(cards[0].seen).toBeUndefined();
    });

    it('does NOT push a card for a reply to someone else', async () => {
      const groupId = 'notif-reply-other';
      const { impl, useNotificationsStore } = await loginAndSubscribe(groupId);
      const parent = await fakeRelayMessageWithTags({ groupId, content: 'theirs' });
      deliver(parent);
      deliver(await fakeRelayMessageWithTags({
        groupId,
        content: 'answering them',
        tags: [['e', parent.id, '', 'reply'], ['p', parent.pubkey]],
      }));
      await flush();

      expect(impl.messagesByGroup.get()[groupId]).toHaveLength(2);
      expect(useNotificationsStore.getState().mentionsByRelay[impl.currentRelayUrl.get()]).toBeUndefined();
    });

    it('p-tags nostr:npub mentions in outgoing messages (NIP-27)', async () => {
      const groupId = 'notif-ptag-out';
      const { bridge } = await loginAndSubscribe(groupId);
      const other = makeKeypair();
      const { npubEncode } = await import('nostr-tools/nip19');
      await bridge.sendMessage(groupId, `hi nostr:${npubEncode(other.pkHex)}`);
      await flush(12);
      const sent = fake.state.published.filter((e) => e.kind === 9).at(-1);
      expect(sent?.tags).toContainEqual(['p', other.pkHex]);
    });

    it('opens a live relay-wide kind 9 REQ so channels without a stream still ping', async () => {
      const groupId = 'notif-live-sub';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      await flush(8);
      const live = fake.state.subscriptions.find((s) => {
        const f = s.filter as Filter;
        return f.kinds?.length === 1 && f.kinds[0] === 9 && !f['#h'] && typeof f.since === 'number';
      });
      expect(live).toBeTruthy();

      // A mention in a channel with no per-channel stream reaches the bell.
      const far = await fakeRelayMessageWithTags({
        groupId: 'unsubscribed-channel',
        content: 'hey nostr:npub-less mention',
        tags: [['p', pkHex]],
      });
      live!.sink(far);
      await flush();
      const relay = impl.currentRelayUrl.get();
      const cards = useNotificationsStore.getState().mentionsByRelay[relay] ?? [];
      expect(cards.map((c) => c.channelId)).toEqual(['unsubscribed-channel']);
      // ...without being injected into that channel's message list.
      expect(impl.messagesByGroup.get()['unsubscribed-channel']).toBeUndefined();
    });

    it('the live REQ leaves channels with their own stream to ingestMessage (one card)', async () => {
      const groupId = 'notif-live-dup';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      await flush(8);
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'hi', tags: [['p', pkHex]] }));
      await flush();
      const relay = impl.currentRelayUrl.get();
      expect(useNotificationsStore.getState().mentionsByRelay[relay]).toHaveLength(1);
      expect(impl.messagesByGroup.get()[groupId]).toHaveLength(1);
    });

    it('a background ping stays unread after switching to its relay', async () => {
      const groupId = 'notif-repro';
      const { bridge, impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      const { getUnreadMentionCount } = await import('@/store/notifications');
      const relayA = impl.currentRelayUrl.get();
      useNotificationsStore.getState().registerRelay(relayA);
      await flush();
      await bridge.switchRelay('wss://relay-b.example.com');
      await flush(8);
      const ping = await fakeRelayMessageWithTags({ groupId: 'far', content: 'yo', tags: [['p', pkHex]], createdAt: Math.floor(Date.now() / 1000) + 2 });
      (impl as unknown as { ingestPing(r: string, e: NostrEvent, s: string): void }).ingestPing(relayA, ping, 'background');
      expect(getUnreadMentionCount(relayA)).toBe(1);
      await bridge.switchRelay(relayA);
      await flush(8);
      expect(getUnreadMentionCount(relayA)).toBe(1);
    });

    it('page-reload restore stamps the mention floor, scopes the store, and starts the background watch', async () => {
      // Regression: initialize() doesn't go through finalizeLogin, and used
      // to skip all three: every historical mention became an unread card
      // that could never be seen, and background listening was off until
      // the user switched relays.
      const { STORAGE_KEY, RELAYS_KEY } = await import('@/services/nostr-bridge/client');
      const { skHex, pkHex } = makeKeypair();
      const active = 'wss://relay.example.com';
      const other = 'wss://other.example.com';
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ privKeyHex: skHex, pubKeyHex: pkHex, loginMethod: 'nsec', relayUrl: active }));
      localStorage.setItem(RELAYS_KEY, JSON.stringify([active, other]));
      localStorage.setItem(`obelisk-dex/recent-relays/${pkHex}`, JSON.stringify([other]));
      const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
      await getBridge();
      await flush(8);
      const { useNotificationsStore } = await import('@/store/notifications');
      expect(useNotificationsStore.getState().mentionCursorByRelay[active]).toBeGreaterThan(0);
      expect(useNotificationsStore.persist.getOptions().name).toBe(`obelisk-notifications:${pkHex}`);
      expect(getBridgeImpl()!.getBackgroundWatchedRelays()).toEqual([other]);
    });

    it('channel prefs: Nothing drops the card; muted keeps it silently; unfollowed still pings on mentions', async () => {
      const groupId = 'notif-prefs';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      const { useChannelPrefsStore, MUTED_FOREVER } = await import('@/store/channel-prefs');
      const alert = await import('@/services/notifications/alert');
      const announce = vi.spyOn(alert, 'announceIncoming');
      const relay = impl.currentRelayUrl.get();
      const cards = () => useNotificationsStore.getState().mentionsByRelay[relay] ?? [];
      const at = () => Math.floor(Date.now() / 1000) + 2;

      useChannelPrefsStore.getState().setNotify(relay, groupId, 'nothing');
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'a', tags: [['p', pkHex]], createdAt: at() }));
      await flush();
      expect(cards()).toHaveLength(0);

      useChannelPrefsStore.getState().setNotify(relay, groupId, 'mentions');
      useChannelPrefsStore.getState().setMutedUntil(relay, groupId, MUTED_FOREVER);
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'b', tags: [['p', pkHex]], createdAt: at() }));
      await flush();
      expect(cards()).toHaveLength(1);
      expect(announce).not.toHaveBeenCalled();

      useChannelPrefsStore.getState().setMutedUntil(relay, groupId, null);
      useChannelPrefsStore.getState().setFollowing(relay, groupId, false);
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'c', tags: [['p', pkHex]], createdAt: at() }));
      await flush();
      expect(cards()).toHaveLength(2);
      expect(announce).toHaveBeenCalledTimes(1);
      announce.mockRestore();
    });

    it("channel prefs: 'All messages' chimes on ordinary traffic, but not when unfollowed", async () => {
      const groupId = 'notif-all';
      const { impl, useNotificationsStore } = await loginAndSubscribe(groupId);
      const { useChannelPrefsStore } = await import('@/store/channel-prefs');
      const alert = await import('@/services/notifications/alert');
      const announce = vi.spyOn(alert, 'announceIncoming');
      const relay = impl.currentRelayUrl.get();
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'hi all' }));
      await flush();
      expect(announce).not.toHaveBeenCalled();

      useChannelPrefsStore.getState().setNotify(relay, groupId, 'all');
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'hi again' }));
      await flush();
      expect(announce).toHaveBeenCalledTimes(1);
      expect(useNotificationsStore.getState().mentionsByRelay[relay]).toBeUndefined(); // no card for plain traffic

      useChannelPrefsStore.getState().setFollowing(relay, groupId, false);
      deliver(await fakeRelayMessageWithTags({ groupId, content: 'third' }));
      await flush();
      expect(announce).toHaveBeenCalledTimes(1);
      announce.mockRestore();
    });

    it('background pings land on their own relay and never on the active one', async () => {
      const groupId = 'notif-bg';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      const other = 'wss://elsewhere.example';
      const ping = await fakeRelayMessageWithTags({ groupId: 'far-channel', content: 'yo', tags: [['p', pkHex]] });
      (impl as unknown as { ingestPing(r: string, e: NostrEvent, s: string): void }).ingestPing(other, ping, 'background');
      const cards = useNotificationsStore.getState().mentionsByRelay[other] ?? [];
      expect(cards).toHaveLength(1);
      expect(cards[0].channelId).toBe('far-channel');
      expect(cards[0].reason).toBe('mention');

      // Arriving via the watcher for the ACTIVE relay is ignored: the main
      // ingest owns that relay.
      const active = impl.currentRelayUrl.get();
      const dup = await fakeRelayMessageWithTags({ groupId, content: 'dup', tags: [['p', pkHex]] });
      (impl as unknown as { ingestPing(r: string, e: NostrEvent, s: string): void }).ingestPing(active, dup, 'background');
      expect(useNotificationsStore.getState().mentionsByRelay[active]).toBeUndefined();
    });

    it('does NOT push a card for ordinary channel traffic', async () => {
      const groupId = 'notif-plain';
      const { impl, useNotificationsStore } = await loginAndSubscribe(groupId);

      deliver(await fakeRelayMessage({ groupId, content: 'just chatting' }));
      await flush();

      expect(impl.messagesByGroup.get()[groupId]).toHaveLength(1);
      const relay = impl.currentRelayUrl.get();
      expect(useNotificationsStore.getState().mentionsByRelay[relay]).toBeUndefined();
    });

    it('does NOT push a card when I mention myself', async () => {
      const groupId = 'notif-self';
      const { impl, skHex, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);

      // Signed by MY key and #p-tagging me: everything a mention needs
      // except being from someone else.
      deliver(finalizeEvent(
        {
          kind: 9,
          content: 'note to self',
          tags: [['h', groupId], ['p', pkHex]],
          created_at: Math.floor(Date.now() / 1000),
        } as Parameters<typeof finalizeEvent>[0],
        hexToBytesForTest(skHex),
      ));
      await flush();

      const mineList = impl.messagesByGroup.get()[groupId] ?? [];
      const self = mineList.find((m) => m.content === 'note to self');
      expect(self).toBeTruthy();
      expect(self!.mentions).toContain(pkHex);   // it IS a mention...
      expect(self!.pubkey).toBe(pkHex);          // ...but it is mine
      const relay = impl.currentRelayUrl.get();
      expect(useNotificationsStore.getState().mentionsByRelay[relay]).toBeUndefined();
    });

    it('drops backfill older than the relay cursor', async () => {
      const groupId = 'notif-backfill';
      const { impl, pkHex, useNotificationsStore } = await loginAndSubscribe(groupId);
      const relay = impl.currentRelayUrl.get();

      // Simulate "user has read this relay's mentions up to now".
      useNotificationsStore.getState().markMentionsRead(relay);

      deliver(await fakeRelayMessageWithTags({
        groupId,
        content: 'old mention from history',
        tags: [['p', pkHex]],
        createdAt: Math.floor(Date.now() / 1000) - 86_400,
      }));
      await flush();

      expect(impl.messagesByGroup.get()[groupId]).toHaveLength(1);
      expect(useNotificationsStore.getState().mentionsByRelay[relay]).toBeUndefined();
    });
  });
});
