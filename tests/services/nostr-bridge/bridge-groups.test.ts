/**
 * Channels on the pool-level fake: create and edit metadata, nesting, forum tags and topics, messages and reactions on the wire, membership commands and moderation.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_GROUP_METADATA } from '@/utils/nip-kinds';
import {
  deliver,
  fakeRelayList,
  fakeRelayMetadata,
  fakeRelayMetadataWithExtraTags,
  fakeRelayMetadataWithT,
  flush,
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

  it('createGroup publishes a kind 9007 + 9002 and the group appears in the groups store', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupsSeen: ReadonlyArray<unknown>[] = [];
    bridge.subscribeGroups((g) => groupsSeen.push(g));

    const id = await bridge.createGroup({ name: 'Test Channel', about: 'Hello world', isPublic: true, isOpen: true });
    await flush();

    const kinds = fake.state.published.map((e) => e.kind);
    expect(kinds).toContain(9007);
    expect(kinds).toContain(9002);

    // Author of the metadata isn't necessarily the relay (in NIP-29 it would
    // come from the relay), but our fake pool just echoes whatever is
    // published, including the user's own kind 9002, which the bridge
    // ingests via its kind 39000 subscription. Since the test relay echoes
    // only what we publish, simulate the relay fanning out by injecting a
    // 39000 metadata event from the "relay".
    const metaEvent: NostrEvent = await fakeRelayMetadata({
      groupId: id, name: 'Test Channel', about: 'Hello world', isPublic: true, isOpen: true,
    });
    deliver(metaEvent);
    await flush();

    const last = groupsSeen.at(-1) as { id: string; name: string | null }[];
    expect(last.find((g) => g.id === id)?.name).toBe('Test Channel');
  });


  it('parses and publishes NIP-29 hidden/restricted access tags', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupsSeen: ReadonlyArray<{ id: string; isPublic: boolean; isHidden: boolean; isRestricted: boolean; isOpen: boolean }>[] = [];
    bridge.subscribeGroups((groups) => groupsSeen.push(groups));
    deliver(await fakeRelayMetadata({
      groupId: 'private-hidden',
      isPublic: false,
      isHidden: true,
      isRestricted: true,
      isOpen: false,
    }));
    await flush();

    expect(groupsSeen.at(-1)?.find((group) => group.id === 'private-hidden')).toMatchObject({
      isPublic: false,
      isHidden: true,
      isRestricted: true,
      isOpen: false,
    });

    await bridge.editGroupMetadata({
      groupId: 'private-hidden',
      isPublic: false,
      isHidden: true,
      isRestricted: true,
      isOpen: false,
    });
    const edit = fake.state.published.find((event) => event.kind === 9002);
    expect(edit?.tags).toContainEqual(['private']);
    expect(edit?.tags).toContainEqual(['hidden']);
    expect(edit?.tags).toContainEqual(['restricted']);
    expect(edit?.tags).toContainEqual(['closed']);
  });


  it('sendMessage round-trips through subscribers', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'testgroup1';
    const seen: { id: string; content: string }[][] = [];
    bridge.subscribeMessages(groupId, (msgs) => seen.push(msgs.map((m) => ({ id: m.id, content: m.content }))));

    await bridge.sendMessage(groupId, 'hello from test');
    await flush();

    const flat = seen.flat();
    expect(flat.some((m) => m.content === 'hello from test')).toBe(true);
    const published = fake.state.published.filter((e) => e.kind === 9);
    expect(published).toHaveLength(1);
    expect(published[0].tags).toContainEqual(['h', groupId]);
  });


  it('sendMessage carries NIP-30 custom emoji tags', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'emoji-group';
    const seen: Array<Array<{ content: string; customEmojis?: Readonly<Record<string, string>> }>> = [];
    bridge.subscribeMessages(groupId, (msgs) => {
      seen.push(msgs.map((m) => ({ content: m.content, customEmojis: m.customEmojis })));
    });

    await bridge.sendMessage(groupId, 'hello :party:', null, [
      ['emoji', 'party', 'https://example.com/party.webp'],
    ]);
    await flush();

    const published = fake.state.published.filter((e) => e.kind === 9);
    expect(published).toHaveLength(1);
    expect(published[0].tags).toContainEqual(['emoji', 'party', 'https://example.com/party.webp']);
    expect(seen.flat().some((m) => m.customEmojis?.party === 'https://example.com/party.webp')).toBe(true);
  });


  it("sendMessage preserves the distinct sticker marker through relay echo", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = "sticker-group";
    const seen: Array<Array<{ sticker?: { name: string; url: string } }>> = [];
    bridge.subscribeMessages(groupId, (msgs) => {
      seen.push(msgs.map((message) => ({ sticker: message.sticker })));
    });

    await bridge.sendMessage(groupId, ":party:", null, [
      ["emoji", "party", "https://example.com/party.webp"],
      ["sticker", "party", "https://example.com/party.webp"],
    ]);
    await flush();

    const published = fake.state.published.filter((event) => event.kind === 9);
    expect(published[0].tags).toContainEqual(["sticker", "party", "https://example.com/party.webp"]);
    expect(seen.flat().some((message) => message.sticker?.name === "party")).toBe(true);
  });


  it('sendMessage preserves voice-note duration through relay echo', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'voice-note-group';
    const url = 'https://example.com/voice.webm';
    const seen: Array<Array<{ voiceNote?: { url: string; durationSeconds: number } }>> = [];
    bridge.subscribeMessages(groupId, (msgs) => {
      seen.push(msgs.map((message) => ({ voiceNote: message.voiceNote })));
    });

    await bridge.sendMessage(groupId, url, null, [['voice', url, '5']]);
    await flush();

    const published = fake.state.published.filter((event) => event.kind === 9);
    expect(published[0].tags).toContainEqual(['voice', url, '5']);
    expect(seen.flat().some((message) => message.voiceNote?.durationSeconds === 5)).toBe(true);
  });


  it('sendReaction emits a kind 7 with target and group tags', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'testgroup2';
    bridge.subscribeReactions(groupId, () => {});
    await bridge.sendReaction('targetEventId123', pkHex, '🔥', groupId);
    await flush();

    const reactions = fake.state.published.filter((e) => e.kind === 7);
    expect(reactions).toHaveLength(1);
    expect(reactions[0].content).toBe('🔥');
    expect(reactions[0].tags).toContainEqual(['e', 'targetEventId123']);
    expect(reactions[0].tags).toContainEqual(['h', groupId]);
  });


  it('sendReaction carries NIP-30 custom emoji tags', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'emoji-reaction-group';
    const seen: Array<Array<{ emoji: string; customEmojis?: Readonly<Record<string, string>> }>> = [];
    bridge.subscribeReactions(groupId, (byEvent) => {
      seen.push((byEvent.targetEventId123 ?? []).map((r) => ({
        emoji: r.emoji,
        customEmojis: r.customEmojis,
      })));
    });

    await bridge.sendReaction('targetEventId123', pkHex, ':party:', groupId, [
      ['emoji', 'party', 'https://example.com/party.webp'],
    ]);
    await flush();

    const reactions = fake.state.published.filter((e) => e.kind === 7);
    expect(reactions).toHaveLength(1);
    expect(reactions[0].content).toBe(':party:');
    expect(reactions[0].tags).toContainEqual(['emoji', 'party', 'https://example.com/party.webp']);
    expect(seen.flat()).toContainEqual({
      emoji: ':party:',
      customEmojis: { party: 'https://example.com/party.webp' },
    });
  });


  it('removeReaction publishes a NIP-09 delete event and removes the local reaction', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'remove-reaction-group';
    const seen: Array<Record<string, Array<{ id: string; emoji: string }>>> = [];
    bridge.subscribeReactions(groupId, (byEvent) => {
      seen.push(Object.fromEntries(
        Object.entries(byEvent).map(([eventId, reactions]) => [
          eventId,
          reactions.map((r) => ({ id: r.id, emoji: r.emoji })),
        ]),
      ));
    });

    await bridge.sendReaction('targetEventId123', pkHex, '🔥', groupId);
    await flush();
    const reaction = fake.state.published.find((e) => e.kind === 7);
    expect(reaction).toBeTruthy();

    await bridge.removeReaction(groupId, reaction!.id);
    await flush();

    const deletion = fake.state.published.find((e) => e.kind === 5);
    expect(deletion?.content).toBe('remove reaction');
    expect(deletion?.tags).toContainEqual(['e', reaction!.id]);
    expect(deletion?.tags).toContainEqual(['k', '7']);
    expect(deletion?.tags).toContainEqual(['h', groupId]);
    expect(seen.at(-1)?.targetEventId123 ?? []).toEqual([]);
  });


  it('removeMessage publishes a NIP-09 delete event and removes the local message', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'remove-message-group';
    const seen: Array<Array<{ id: string; content: string }>> = [];
    bridge.subscribeMessages(groupId, (msgs) => {
      seen.push(msgs.map((m) => ({ id: m.id, content: m.content })));
    });

    await bridge.sendMessage(groupId, 'delete this');
    await flush();
    const message = fake.state.published.find((e) => e.kind === 9);
    expect(message).toBeTruthy();

    await bridge.removeMessage(groupId, message!.id);
    await flush();

    const deletion = fake.state.published.find((e) => e.kind === 5);
    expect(deletion?.content).toBe('remove message');
    expect(deletion?.tags).toContainEqual(['e', message!.id]);
    expect(deletion?.tags).toContainEqual(['k', '9']);
    expect(deletion?.tags).toContainEqual(['h', groupId]);
    expect(seen.at(-1)?.some((m) => m.id === message!.id)).toBe(false);
  });


  it('deleteGroupEvent removes moderated messages and reactions from local state', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'moderation-delete-group';
    const seenMessages: Array<Array<string>> = [];
    const seenReactions: Array<Record<string, string[]>> = [];
    bridge.subscribeMessages(groupId, (msgs) => {
      seenMessages.push(msgs.map((m) => m.id));
    });
    bridge.subscribeReactions(groupId, (byEvent) => {
      seenReactions.push(Object.fromEntries(
        Object.entries(byEvent).map(([eventId, reactions]) => [
          eventId,
          reactions.map((r) => r.id),
        ]),
      ));
    });

    await bridge.sendMessage(groupId, 'moderate this');
    await flush();
    const message = fake.state.published.find((e) => e.kind === 9);
    expect(message).toBeTruthy();

    await bridge.sendReaction(message!.id, pkHex, '🔥', groupId);
    await flush();
    const reaction = fake.state.published.find((e) => e.kind === 7);
    expect(reaction).toBeTruthy();
    expect(seenReactions.at(-1)?.[message!.id]).toContain(reaction!.id);

    await bridge.deleteGroupEvent(groupId, reaction!.id);
    await flush();
    expect(fake.state.published.find((e) => e.kind === 9005)?.tags).toContainEqual(['e', reaction!.id]);
    expect(seenReactions.at(-1)?.[message!.id] ?? []).toEqual([]);

    await bridge.deleteGroupEvent(groupId, message!.id);
    await flush();
    expect(seenMessages.at(-1)).not.toContain(message!.id);
  });


  it('putUser, removeUser, removePermission, deleteGroupEvent publish the right NIP-29 kinds', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const target = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    await bridge.putUser('grpA', target.pkHex, ['admin']);
    await bridge.removeUser('grpA', target.pkHex);
    await bridge.removePermission('grpA', target.pkHex, ['admin']);
    await bridge.deleteGroupEvent('grpA', 'evt-deadbeef');
    await flush();

    const kinds = fake.state.published.map((e) => e.kind).sort();
    expect(kinds).toContain(9000);
    expect(kinds).toContain(9001);
    expect(kinds).toContain(9003);
    expect(kinds).toContain(9005);

    const put = fake.state.published.find((e) => e.kind === 9000);
    expect(put?.tags).toContainEqual(['h', 'grpA']);
    // p-tag carries optional roles after the pubkey
    const pTag = put?.tags.find((t) => t[0] === 'p');
    expect(pTag?.[1]).toBe(target.pkHex);
    expect(pTag?.[2]).toBe('admin');

    const remPerm = fake.state.published.find((e) => e.kind === 9003);
    expect(remPerm?.tags).toContainEqual(['h', 'grpA']);
    const permTag = remPerm?.tags.find((t) => t[0] === 'p');
    expect(permTag?.[1]).toBe(target.pkHex);
    expect(permTag?.[2]).toBe('admin');

    const del = fake.state.published.find((e) => e.kind === 9005);
    expect(del?.tags).toContainEqual(['e', 'evt-deadbeef']);
  });


  it('claimCreatorAdmin no-ops when the active user is not the kind 9007 author', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const otherCreator = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // Seed the creators map with somebody else.
    getBridgeImpl()!.groupCreators.update((m) => ({ ...m, grpX: otherCreator.pkHex }));

    fake.state.published = [];
    const published = await bridge.claimCreatorAdmin('grpX');
    await flush();

    expect(published).toBe(false);
    expect(fake.state.published.filter((e) => e.kind === 9000)).toHaveLength(0);
  });


  it('claimCreatorAdmin no-ops when the user is already in the 39001 admin list', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const impl = getBridgeImpl()!;
    impl.groupCreators.update((m) => ({ ...m, grpY: pkHex }));
    impl.adminsByGroup.update((m) => ({ ...m, grpY: [pkHex] }));

    fake.state.published = [];
    const published = await bridge.claimCreatorAdmin('grpY');
    await flush();

    expect(published).toBe(false);
    expect(fake.state.published.filter((e) => e.kind === 9000)).toHaveLength(0);
  });


  it('claimCreatorAdmin publishes one kind 9000 admin when creator and not yet listed', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const impl = getBridgeImpl()!;
    impl.groupCreators.update((m) => ({ ...m, grpZ: pkHex }));
    // 39001 has not yet been delivered → adminsByGroup['grpZ'] is empty.

    fake.state.published = [];
    const published = await bridge.claimCreatorAdmin('grpZ');
    await flush();

    expect(published).toBe(true);
    const claims = fake.state.published.filter((e) => e.kind === 9000);
    expect(claims).toHaveLength(1);
    expect(claims[0].tags).toContainEqual(['h', 'grpZ']);
    const pTag = claims[0].tags.find((t) => t[0] === 'p');
    expect(pTag?.[1]).toBe(pkHex);
    expect(pTag?.[2]).toBe('admin');
  });


  it('createGroup no longer publishes a kind 9000 self-claim (lazy claim only)', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    fake.state.published = [];
    await bridge.createGroup({ name: 'Spam-free', isPublic: true, isOpen: true });
    await flush();

    expect(fake.state.published.filter((e) => e.kind === 9000)).toHaveLength(0);
    expect(fake.state.published.find((e) => e.kind === 9007)).toBeTruthy();
    expect(fake.state.published.find((e) => e.kind === 9002)).toBeTruthy();
  });


  it('subscribeAdmins / subscribeMembers parse 39001/39002 p-tags', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const a = makeKeypair();
    const b = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const adminsSeen: ReadonlyArray<string>[] = [];
    const membersSeen: ReadonlyArray<string>[] = [];
    bridge.subscribeAdmins('grpZ', (l) => adminsSeen.push(l));
    bridge.subscribeMembers('grpZ', (l) => membersSeen.push(l));

    deliver(await fakeRelayList({ groupId: 'grpZ', kind: 39001, pubkeys: [a.pkHex] }));
    deliver(await fakeRelayList({ groupId: 'grpZ', kind: 39002, pubkeys: [a.pkHex, b.pkHex] }));
    await flush();

    expect(adminsSeen.at(-1)).toEqual([a.pkHex]);
    expect(membersSeen.at(-1)).toEqual([a.pkHex, b.pkHex]);
  });


  it('createGroup with parent emits a [parent,id] tag on the kind 9002 metadata', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const childId = await bridge.createGroup({
      name: 'My thread',
      isPublic: true,
      isOpen: true,
      parent: 'forum-container-1',
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === childId),
    );
    expect(meta).toBeTruthy();
    expect(meta?.tags).toContainEqual(['parent', 'forum-container-1']);
  });


  it('group with [t,forum] metadata is parsed as kind=forum', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupsSeen: ReadonlyArray<{ id: string; kind: string }>[] = [];
    bridge.subscribeGroups((g) => groupsSeen.push(g.map((x) => ({ id: x.id, kind: x.kind }))));

    deliver(await fakeRelayMetadata({ groupId: 'g-text', name: 'T' }));
    deliver(await fakeRelayMetadataWithT({ groupId: 'g-forum', name: 'F', t: 'forum' }));
    deliver(await fakeRelayMetadataWithT({ groupId: 'g-voice', name: 'V', t: 'voice' }));
    await flush();

    const last = groupsSeen.at(-1) as { id: string; kind: string }[];
    expect(last.find((g) => g.id === 'g-text')?.kind).toBe('text');
    expect(last.find((g) => g.id === 'g-forum')?.kind).toBe('forum');
    expect(last.find((g) => g.id === 'g-voice')?.kind).toBe('voice');
  });


  it('child group nesting populates childrenByParent', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const observed: Record<string, ReadonlyArray<string>>[] = [];
    bridge.subscribeChildrenByParent((m) => observed.push({ ...m }));

    deliver(await fakeRelayMetadata({ groupId: 'parent1', name: 'Parent' }));
    deliver(await fakeRelayMetadata({ groupId: 'child1', name: 'Child', parent: 'parent1' }));
    await flush();

    const last = observed.at(-1) as Record<string, ReadonlyArray<string>>;
    expect(last.parent1).toContain('child1');
  });


  it('skips localStorage cacheSet when an admin/member republish carries identical pubkeys', async () => {
    // Regression test for the cache-write skip optimization (A4). The
    // bridge persists 39001/39002 admin/member lists per relay for
    // instant-paint on reload. A relay routinely republishes the same
    // event under a fresher created_at after a reconnect: the in-memory
    // newest-wins guard short-circuits the store update, but without this
    // skip the localStorage.setItem would still fire (a sync main-thread
    // operation we want to avoid).
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const groupId = 'cache-skip-group';
      const member = generateSecretKey();
      const memberPk = getPublicKey(member);
      const author = generateSecretKey();
      const authorPk = getPublicKey(author);
      const base = Math.floor(Date.now() / 1000);
      const buildAdmins = async (ts: number): Promise<NostrEvent> =>
        finalizeEvent(
          {
            kind: 39001,
            content: '',
            tags: [['d', groupId], ['p', memberPk]],
            created_at: ts,
            pubkey: authorPk,
          } as Parameters<typeof finalizeEvent>[0],
          author,
        );

      // Drive a subscription so the ingest path runs.
      bridge.subscribeAdmins(groupId, () => {});

      deliver(await buildAdmins(base + 1));
      await flush();

      // Locate cache writes targeting THIS group's admin entry: we don't
      // care about unrelated bridge bookkeeping (session storage etc.).
      const cacheKeyMatcher = (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes(`/39001/${groupId}`);
      const firstWrites = setItemSpy.mock.calls.filter(cacheKeyMatcher).length;
      expect(firstWrites).toBe(1);

      // Republish the identical pubkey list under a later created_at.
      // Newest-wins guard lets ingest proceed; the cache equality check
      // must suppress the write.
      setItemSpy.mockClear();
      deliver(await buildAdmins(base + 2));
      await flush();

      const secondWrites = setItemSpy.mock.calls.filter(cacheKeyMatcher).length;
      expect(secondWrites).toBe(0);
    } finally {
      setItemSpy.mockRestore();
    }
  });


  it('re-parenting a group moves it to the new parent bucket without leaving stale entries', async () => {
    // Regression test for the O(1) reverse-index optimization
    // ({@link groupParentMap}): when a kind 39000 event arrives with a
    // different parent than we previously had cached, the child must be
    // removed from the old parent's bucket and only the new parent's
    // bucket should contain it. Prior implementation scanned every bucket
    // with Object.keys+filter; the new one looks up the previous parent
    // in O(1). This test ensures the new code still handles re-parents.
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const observed: Record<string, ReadonlyArray<string>>[] = [];
    bridge.subscribeChildrenByParent((m) => observed.push({ ...m }));

    // Three revisions of the same child with increasing created_at so each
    // ingest replaces the prior (newest-wins guard). created_at must
    // strictly increase to avoid being dropped.
    const base = Math.floor(Date.now() / 1000);
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const buildRevision = async (parent: string, ts: number): Promise<NostrEvent> =>
      finalizeEvent(
        {
          kind: 39000,
          content: '',
          tags: [['d', 'mover'], ['name', 'Mover'], ['parent', parent]],
          created_at: ts,
          pubkey: pk,
        } as Parameters<typeof finalizeEvent>[0],
        sk,
      );

    deliver(await fakeRelayMetadata({ groupId: 'p-a', name: 'A' }));
    deliver(await fakeRelayMetadata({ groupId: 'p-b', name: 'B' }));
    deliver(await fakeRelayMetadata({ groupId: 'p-c', name: 'C' }));
    deliver(await buildRevision('p-a', base + 1));
    deliver(await buildRevision('p-b', base + 2));
    deliver(await buildRevision('p-c', base + 3));
    await flush();

    const last = observed.at(-1) as Record<string, ReadonlyArray<string>>;
    // Final parent must contain the child.
    expect(last['p-c']).toContain('mover');
    // Old parents must NOT: this is what the reverse index guarantees.
    expect(last['p-a'] ?? []).not.toContain('mover');
    expect(last['p-b'] ?? []).not.toContain('mover');
  });


  it('parses [forum-tag,id,name,emoji?] entries on kind 39000 into JsGroup.forumTags', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const seen: ReadonlyArray<ReadonlyArray<{ id: string; tags: ReadonlyArray<{ id: string; name: string; emoji: string | null }> }>> = [] as never;
    const observed: { id: string; tags: ReadonlyArray<{ id: string; name: string; emoji: string | null }> }[][] = [];
    bridge.subscribeGroups((g) =>
      observed.push(g.map((x) => ({ id: x.id, tags: x.forumTags }))),
    );
    void seen;

    // One forum tag with emoji, one without, plus a malformed entry that
    // must be silently dropped (missing name).
    deliver(
      await fakeRelayMetadataWithExtraTags({
        groupId: 'g-forum-with-tags',
        name: 'Plaza',
        extraTags: [
          ['t', 'forum'],
          ['forum-tag', 'tag-lacrypta', 'LaCrypta', '📜'],
          ['forum-tag', 'tag-trabajo', 'trabajo'],
          ['forum-tag', '', 'broken-no-id'],
          ['forum-tag', 'tag-empty-name', ''],
        ],
      }),
    );
    await flush();

    const last = observed.at(-1) as { id: string; tags: ReadonlyArray<{ id: string; name: string; emoji: string | null }> }[];
    const forum = last.find((g) => g.id === 'g-forum-with-tags');
    expect(forum).toBeTruthy();
    expect(forum?.tags).toEqual([
      { id: 'tag-lacrypta', name: 'LaCrypta', emoji: '📜', color: null },
      { id: 'tag-trabajo', name: 'trabajo', emoji: null, color: null },
    ]);
  });


  it('parses [topic,id] entries on kind 39000 into JsGroup.topics, de-duped', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const observed: { id: string; topics: ReadonlyArray<string> }[][] = [];
    bridge.subscribeGroups((g) => observed.push(g.map((x) => ({ id: x.id, topics: x.topics }))));

    deliver(
      await fakeRelayMetadataWithExtraTags({
        groupId: 'thread-1',
        name: 'a thread',
        parent: 'forum-1',
        extraTags: [
          ['topic', 'tag-a'],
          ['topic', 'tag-b'],
          ['topic', 'tag-a'], // duplicate: must be de-duped
          ['topic', ''], // empty: dropped
        ],
      }),
    );
    await flush();

    const last = observed.at(-1) as { id: string; topics: ReadonlyArray<string> }[];
    const t = last.find((g) => g.id === 'thread-1');
    expect(t?.topics).toEqual(['tag-a', 'tag-b']);
  });


  it('createGroup with topics emits one [topic,id] tag per entry on kind 9002', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const childId = await bridge.createGroup({
      name: 'tagged thread',
      isPublic: true,
      isOpen: true,
      parent: 'forum-1',
      topics: ['tag-a', 'tag-b'],
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === childId),
    );
    expect(meta).toBeTruthy();
    expect(meta?.tags).toContainEqual(['topic', 'tag-a']);
    expect(meta?.tags).toContainEqual(['topic', 'tag-b']);
  });


  it('editGroupMetadata with forumTags emits [forum-tag,id,name,emoji?] for each entry', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    await bridge.editGroupMetadata({
      groupId: 'forum-edit-1',
      name: 'Plaza',
      kind: 'forum',
      forumTags: [
        { id: 'tag-1', name: 'LaCrypta', emoji: '📜', color: null },
        { id: 'tag-2', name: 'no-emoji', emoji: null, color: null },
        // Bad entry: empty name. editGroupMetadata's tag emitter drops these.
        { id: 'tag-3', name: '', emoji: '🙃', color: null },
      ],
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === 'forum-edit-1'),
    );
    expect(meta).toBeTruthy();
    expect(meta?.tags).toContainEqual(['forum-tag', 'tag-1', 'LaCrypta', '📜']);
    expect(meta?.tags).toContainEqual(['forum-tag', 'tag-2', 'no-emoji']);
    // Bad entry must NOT show up.
    const bad = meta?.tags.find((t) => t[0] === 'forum-tag' && t[1] === 'tag-3');
    expect(bad).toBeUndefined();
  });


  it('round-trips a publication tag color through slot 4', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    await bridge.editGroupMetadata({
      groupId: 'forum-color-1',
      name: 'Plaza',
      kind: 'forum',
      forumTags: [
        { id: 'c1', name: 'Hardware', emoji: null, color: 'amber' },
        { id: 'c2', name: 'Software', emoji: '💾', color: 'cyan' },
        { id: 'c3', name: 'Plain', emoji: null, color: null },
      ],
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === 'forum-color-1'),
    );
    // Color lives at slot 4, so a colored tag with no emoji must still emit
    // the (empty) emoji slot, otherwise the color is read back as an emoji.
    expect(meta?.tags).toContainEqual(['forum-tag', 'c1', 'Hardware', '', 'amber']);
    expect(meta?.tags).toContainEqual(['forum-tag', 'c2', 'Software', '💾', 'cyan']);
    // No color and no emoji → the short legacy form, unchanged.
    expect(meta?.tags).toContainEqual(['forum-tag', 'c3', 'Plain']);
  });


  it('parses tag colors off the relay, ignoring unknown palette keys', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const seen: Array<ReadonlyArray<{ id: string; forumTags: unknown }>> = [];
    bridge.subscribeGroups((g) => seen.push(g.map((x) => ({ id: x.id, forumTags: x.forumTags }))));

    const relaySk = generateSecretKey();
    deliver(finalizeEvent({
      kind: KIND_GROUP_METADATA,
      created_at: 900,
      content: '',
      tags: [
        ['d', 'forum-parse-1'],
        ['name', 'Plaza'],
        ['t', 'forum'],
        ['forum-tag', 'c1', 'Hardware', '', 'amber'],
        // A legacy 3-slot tag still parses, with no color.
        ['forum-tag', 'c2', 'Legacy'],
        // Anything we don't recognise must not reach a style attribute.
        ['forum-tag', 'c3', 'Evil', '', 'url(javascript:alert(1))'],
      ],
    }, relaySk));
    await flush();

    const group = seen.at(-1)?.find((g) => g.id === 'forum-parse-1');
    expect(group?.forumTags).toEqual([
      { id: 'c1', name: 'Hardware', emoji: null, color: 'amber' },
      { id: 'c2', name: 'Legacy', emoji: null, color: null },
      { id: 'c3', name: 'Evil', emoji: null, color: null },
    ]);
  });


  it('keeps an empty channel-list EOSE provisional until the metadata retry window is exhausted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
      const { skHex, pkHex } = makeKeypair();
      const bridge = await getBridge();
      await bridge.loginWithNsec(skHex, pkHex);
      await flush();

      const impl = getBridgeImpl()!;
      expect(impl.groups.get()).toEqual([]);
      expect(impl.groupMetadataEose.get()).toBe(false);

      await vi.advanceTimersByTimeAsync(1500);
      await flush();
      expect(impl.groupMetadataEose.get()).toBe(false);

      await vi.advanceTimersByTimeAsync(3000);
      await flush();
      expect(impl.groupMetadataEose.get()).toBe(false);

      await vi.advanceTimersByTimeAsync(5500);
      await flush();
      expect(impl.groupMetadataEose.get()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
