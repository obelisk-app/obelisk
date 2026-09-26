import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({ querySocial: vi.fn() }));
vi.mock('./pool', () => ({ querySocial: mocks.querySocial, socialRelays: () => ['wss://a'] }));

const {
  KIND_FOLLOW_SET,
  KIND_STARTER_PACK,
  dedupePacks,
  fetchStarterPacks,
  followedCount,
  mergedFollowTags,
  parseStarterPack,
} = await import('./starter-packs');

const pk = (n: number) => String(n).repeat(64).slice(0, 64);

const packEvent = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'e1',
  pubkey: pk(9),
  kind: KIND_STARTER_PACK,
  created_at: 100,
  content: '',
  sig: '',
  tags: [
    ['d', 'nostr-devs'],
    ['title', 'Nostr devs'],
    ['p', pk(1)],
    ['p', pk(2)],
    ['p', pk(3)],
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.querySocial.mockResolvedValue([]);
});

describe('parseStarterPack', () => {
  it('reads title, members and curator', () => {
    const pack = parseStarterPack(packEvent());
    expect(pack).toMatchObject({
      title: 'Nostr devs',
      curator: pk(9),
      id: `${KIND_STARTER_PACK}:${pk(9)}:nostr-devs`,
    });
    expect(pack?.members).toHaveLength(3);
  });

  it('identifies a pack by coordinate, so an edit is the same pack', () => {
    // The event id changes on every edit; `<kind>:<pubkey>:<d>` does not.
    const a = parseStarterPack(packEvent({ id: 'first', created_at: 1 }));
    const b = parseStarterPack(packEvent({ id: 'second', created_at: 2 }));
    expect(a?.id).toBe(b?.id);
  });

  it('falls back to the d tag when the pack has no title', () => {
    const event = packEvent({ tags: packEvent().tags.filter((tag) => tag[0] !== 'title') });
    expect(parseStarterPack(event)?.title).toBe('nostr-devs');
  });

  it('accepts `name`, which some clients write instead of `title`', () => {
    const tags = packEvent().tags.map((tag) => (tag[0] === 'title' ? ['name', 'Builders'] : tag));
    expect(parseStarterPack(packEvent({ tags }))?.title).toBe('Builders');
  });

  it('rejects a pack with no d tag — it has no stable identity', () => {
    const tags = packEvent().tags.filter((tag) => tag[0] !== 'd');
    expect(parseStarterPack(packEvent({ tags }))).toBeNull();
  });

  it('rejects a two-person list, which is not curation', () => {
    expect(parseStarterPack(packEvent({ tags: [['d', 'x'], ['p', pk(1)], ['p', pk(2)]] }))).toBeNull();
  });

  it('rejects a list too large to follow in one tap', () => {
    // "Follow all" on 600 people is a mistake somebody undoes by hand.
    const tags: string[][] = [['d', 'huge']];
    for (let i = 0; i < 600; i += 1) tags.push(['p', String(i).padStart(64, '0')]);
    expect(parseStarterPack(packEvent({ tags }))).toBeNull();
  });

  it('does not render the encrypted content as a description', () => {
    // A NIP-51 list's `content` is the NIP-44 private section. It was being
    // shown to readers as a wall of base64 where the description goes.
    const event = packEvent({ content: 'AiS2GCOBOLmlegWq8OkraYmR2GZ0000=' });
    expect(parseStarterPack(event)?.description).toBe('');
  });

  it('still shows a real description tag', () => {
    const tags = [...packEvent().tags, ['description', 'People who build on nostr']];
    expect(parseStarterPack(packEvent({ tags }))?.description).toBe('People who build on nostr');
  });

  it('rejects a mute list published as a kind-30000 set', () => {
    // The whole point: this was offered as a pack titled "Mute" with a
    // "Follow 31" button, which follows people someone chose to silence.
    const event = packEvent({
      kind: KIND_FOLLOW_SET,
      content: 'AiS2GCOBOLmlegWq8OkraYmR2GZ0000=',
      tags: [['d', 'mute'], ['p', pk(1)], ['p', pk(2)], ['p', pk(3)]],
    });
    expect(parseStarterPack(event)).toBeNull();
  });

  it.each(['mute', 'Muted', 'blocked', 'bookmarks', 'pin'])(
    'rejects the non-follow category %s',
    (category) => {
      const tags = [['d', category], ['title', 'Looks innocent'], ['p', pk(1)], ['p', pk(2)], ['p', pk(3)]];
      expect(parseStarterPack(packEvent({ kind: KIND_FOLLOW_SET, tags }))).toBeNull();
    },
  );

  it('rejects a kind-30000 set that carries a private section', () => {
    // Encrypted entries mean a personal list, whatever it is categorised as.
    const tags = [['d', 'friends'], ['title', 'Friends'], ['p', pk(1)], ['p', pk(2)], ['p', pk(3)]];
    const event = packEvent({ kind: KIND_FOLLOW_SET, content: 'encrypted', tags });
    expect(parseStarterPack(event)).toBeNull();
  });

  it('rejects a kind-30000 set with no title of its own', () => {
    // Its `d` tag is a category key, not a name — that is how "Mute"
    // ended up on screen as a pack title.
    const tags = [['d', 'people'], ['p', pk(1)], ['p', pk(2)], ['p', pk(3)]];
    expect(parseStarterPack(packEvent({ kind: KIND_FOLLOW_SET, tags }))).toBeNull();
  });

  it('accepts a genuine public kind-30000 follow set', () => {
    const tags = [['d', 'devs'], ['title', 'Devs'], ['p', pk(1)], ['p', pk(2)], ['p', pk(3)]];
    const pack = parseStarterPack(packEvent({ kind: KIND_FOLLOW_SET, tags }));
    expect(pack).toMatchObject({ title: 'Devs' });
    expect(pack?.members).toHaveLength(3);
  });

  it('ignores malformed p tags and duplicates', () => {
    const tags = [['d', 'x'], ['p', pk(1)], ['p', pk(1).toUpperCase()], ['p', 'not-a-key'], ['p', pk(2)], ['p', pk(3)]];
    expect(parseStarterPack(packEvent({ tags }))?.members).toHaveLength(3);
  });
});

describe('dedupePacks', () => {
  it('keeps the newest edit of each pack', () => {
    const older = parseStarterPack(packEvent({ created_at: 1 }))!;
    const newer = parseStarterPack(packEvent({ created_at: 2, tags: [...packEvent().tags, ['p', pk(4)]] }))!;
    const result = dedupePacks([older, newer]);
    expect(result).toHaveLength(1);
    expect(result[0].members).toHaveLength(4);
  });

  it('puts bigger packs first when they are equally recent', () => {
    const small = parseStarterPack(packEvent({ pubkey: pk(8) }))!;
    const big = parseStarterPack(packEvent({
      pubkey: pk(7),
      tags: [...packEvent().tags, ['p', pk(4)], ['p', pk(5)]],
    }))!;
    expect(dedupePacks([small, big])[0].id).toBe(big.id);
  });

  it('ranks by recency before size', () => {
    // Size-first is how a big stale list outranked every curated pack.
    const newerSmall = parseStarterPack(packEvent({ pubkey: pk(8), created_at: 200 }))!;
    const olderBig = parseStarterPack(packEvent({
      pubkey: pk(7),
      created_at: 100,
      tags: [...packEvent().tags, ['p', pk(4)], ['p', pk(5)]],
    }))!;
    expect(dedupePacks([olderBig, newerSmall])[0].id).toBe(newerSmall.id);
  });
});

describe('fetchStarterPacks', () => {
  it('asks for both the starter-pack kind and NIP-51 follow sets', async () => {
    // The ecosystem split: Amethyst/Primal publish 39089, older curated
    // lists are 30000, and a user does not care which one a pack happens
    // to be.
    await fetchStarterPacks();
    expect(mocks.querySocial.mock.calls[0][0][0].kinds).toEqual([KIND_STARTER_PACK, KIND_FOLLOW_SET]);
  });

  it('narrows to curators when asked', async () => {
    await fetchStarterPacks({ curators: [pk(9)] });
    expect(mocks.querySocial.mock.calls[0][0][0].authors).toEqual([pk(9)]);
  });

  it('drops events the coalescer handed us from other consumers', async () => {
    mocks.querySocial.mockResolvedValue([
      packEvent(),
      { ...packEvent(), kind: 1, id: 'a-note' },
    ]);
    const packs = await fetchStarterPacks();
    expect(packs).toHaveLength(1);
  });

  it('returns nothing rather than throwing when the relays have none', async () => {
    expect(await fetchStarterPacks()).toEqual([]);
  });
});

describe('mergedFollowTags', () => {
  it('appends only the members not already followed', () => {
    const tags = mergedFollowTags([['p', pk(1)]], [pk(1), pk(2)]);
    expect(tags.filter((tag) => tag[0] === 'p')).toHaveLength(2);
  });

  it('preserves relay hints and petnames other clients wrote', () => {
    // A fresh p-only list would silently drop these for every client the
    // user owns.
    const current = [['p', pk(1), 'wss://hint.example', 'alice'], ['client', 'other']];
    const tags = mergedFollowTags(current, [pk(2)]);
    expect(tags[0]).toEqual(['p', pk(1), 'wss://hint.example', 'alice']);
    expect(tags).toContainEqual(['client', 'other']);
  });

  it('is case-insensitive about who is already followed', () => {
    const tags = mergedFollowTags([['p', pk(1).toUpperCase()]], [pk(1)]);
    expect(tags.filter((tag) => tag[0] === 'p')).toHaveLength(1);
  });

  it('does not mutate the list it was given', () => {
    const current = [['p', pk(1)]];
    mergedFollowTags(current, [pk(2)]);
    expect(current).toHaveLength(1);
  });
});

describe('followedCount', () => {
  it('counts the overlap, so a pack can say how much is new', () => {
    const pack = parseStarterPack(packEvent())!;
    expect(followedCount(pack, [pk(1), pk(2), pk(7)])).toBe(2);
  });
});
