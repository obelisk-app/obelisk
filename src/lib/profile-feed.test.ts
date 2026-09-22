import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  filterProfileFeed,
  hashtagTags,
  linkifyHashtags,
  toggledFollowTags,
} from './profile-feed';

const note = (id: string, content: string, tags: string[][] = []) => ({
  id,
  content,
  tags,
  kind: 1,
  pubkey: 'a'.repeat(64),
  created_at: 1,
  sig: 'b'.repeat(128),
}) as NostrEvent;

describe('profile feed helpers', () => {
  it('separates posts, replies, and media', () => {
    const notes = [
      note('post', 'hello'),
      note('reply', 'replying', [['e', 'parent', '', 'reply']]),
      note('image', 'https://example.com/photo.jpg'),
      note('video', 'https://example.com/clip.mp4', [['e', 'parent']]),
    ];

    expect(filterProfileFeed(notes, 'posts').map((event) => event.id)).toEqual(['post', 'image']);
    expect(filterProfileFeed(notes, 'replies').map((event) => event.id)).toEqual(['reply', 'video']);
    expect(filterProfileFeed(notes, 'media').map((event) => event.id)).toEqual(['image', 'video']);
  });

  it('gives long-form its own tab and keeps it out of Posts', () => {
    // An essay in a list of one-liners buries them, and the profile page
    // was the one place a person's articles never showed up as articles.
    const article = { ...note('essay', '## On relays'), kind: 30023 } as NostrEvent;
    const notes = [note('post', 'hello'), article];

    expect(filterProfileFeed(notes, 'articles').map((event) => event.id)).toEqual(['essay']);
    expect(filterProfileFeed(notes, 'posts').map((event) => event.id)).toEqual(['post']);
  });

  it('still files a long-form reply under Replies', () => {
    const reply = {
      ...note('reply-essay', 'answering', [['e', 'parent', '', 'reply']]),
      kind: 30023,
    } as NostrEvent;
    expect(filterProfileFeed([reply], 'replies').map((event) => event.id)).toEqual(['reply-essay']);
  });

  it('preserves unrelated kind-3 tags while toggling one follow', () => {
    const tags = [['p', 'existing'], ['relay', 'wss://legacy.example']];
    expect(toggledFollowTags(tags, 'target', true)).toEqual([...tags, ['p', 'target']]);
    expect(toggledFollowTags([...tags, ['p', 'target']], 'target', false)).toEqual(tags);
  });

  it('links hashtags and builds interoperable post tags', () => {
    expect(linkifyHashtags('hello #Nostr and (#bitcoin)')).toBe(
      'hello [#Nostr](/t/nostr) and ([#bitcoin](/t/bitcoin))',
    );
    expect(hashtagTags('#Nostr #nostr #Bitcoin')).toEqual([['t', 'nostr'], ['t', 'bitcoin']]);
  });

  it('does not file a quote under replies', () => {
    // `isReply` now delegates to the NIP-10-marker-aware helper. The old
    // version counted any `e` tag, so quote posts landed in the Replies tab.
    const quote = note('quote', 'look at this', [['q', 'quoted-id', '', 'pk']]);
    expect(filterProfileFeed([quote], 'replies')).toEqual([]);
    expect(filterProfileFeed([quote], 'posts').map((event) => event.id)).toEqual(['quote']);
  });
});

/*
 * Relay-list parsing moved to `src/lib/social/relays.test.ts` — the exactly
 * three relay rule is gone, replaced by an editable 1–8 list. Reply tag
 * construction moved to `src/lib/social/publish.test.ts`, which asserts the
 * marked NIP-10 form (the old `profileReplyTags` emitted root AND reply
 * pointing at the same id for a top-level reply).
 */
