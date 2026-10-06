import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';

const data = vi.hoisted(() => ({ fetchNote: vi.fn() }));
vi.mock('@nostr-wot/data', () => ({ fetchNote: data.fetchNote }));

import {
  dedupeReposts,
  groupReposts,
  embeddedRepostEvent,
  isRepost,
  repostInnerKind,
  repostTarget,
  resolveRepost,
} from '@/services/social/repost';

const ev = (over: Partial<NostrEvent>): NostrEvent => ({
  id: 'id',
  pubkey: 'pk',
  content: '',
  created_at: 1,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

/**
 * Throwaway keys, fixed so the fixtures are stable across runs. The author
 * is the person the embedded note is attributed to; the reposter wraps it;
 * the attacker is whoever forges a blob under the author's pubkey.
 */
const AUTHOR_SK = new Uint8Array(32).fill(1);
const REPOSTER_SK = new Uint8Array(32).fill(2);
const ATTACKER_SK = new Uint8Array(32).fill(3);
const AUTHOR = getPublicKey(AUTHOR_SK);

/** A properly signed kind-1, as a real client would embed it. */
const signedNote = (content = 'hello', sk = AUTHOR_SK): NostrEvent =>
  finalizeEvent({ kind: 1, created_at: 1700000000, tags: [], content }, sk);

/** A kind-6 wrapper around `inner`, signed by the reposter, with the e/p tags NIP-18 asks for. */
const repostOf = (inner: NostrEvent, over: Partial<NostrEvent> = {}): NostrEvent => ({
  ...finalizeEvent({
    kind: 6,
    created_at: 1700000100,
    tags: [['e', inner.id], ['p', inner.pubkey]],
    content: JSON.stringify(inner),
  }, REPOSTER_SK),
  ...over,
});

/** Round-trip through JSON so nothing (including the verified memo) leaks between fixtures. */
const asWire = (e: NostrEvent): NostrEvent => JSON.parse(JSON.stringify(e)) as NostrEvent;

describe('isRepost', () => {
  it('recognises kind 6 and kind 16', () => {
    expect(isRepost({ kind: 6 })).toBe(true);
    expect(isRepost({ kind: 16 })).toBe(true);
    expect(isRepost({ kind: 1 })).toBe(false);
  });
});

describe('repostTarget', () => {
  it('reads the e tag with its relay hint and the p author', () => {
    const target = repostTarget({
      tags: [['e', 'target-id', 'wss://hint'], ['p', 'orig-author']],
    });
    expect(target).toEqual({ id: 'target-id', relayHint: 'wss://hint', author: 'orig-author' });
  });

  it('is null without an e tag', () => {
    expect(repostTarget({ tags: [] })).toBeNull();
  });
});

describe('repostInnerKind', () => {
  it('is always kind 1 for a kind-6 repost', () => {
    expect(repostInnerKind({ kind: 6, tags: [] })).toBe(1);
  });

  it('reads the k tag for a generic kind-16 repost', () => {
    // The k tag lets a reader decide whether it can render the target
    // before going to the network.
    expect(repostInnerKind({ kind: 16, tags: [['k', '30023']] })).toBe(30023);
  });

  it('is null for a kind-16 with no k tag', () => {
    expect(repostInnerKind({ kind: 16, tags: [] })).toBeNull();
  });
});

describe('embeddedRepostEvent', () => {
  it('parses the stringified original out of content when its signature holds', () => {
    const original = signedNote();
    const inner = embeddedRepostEvent(repostOf(original));
    expect(inner?.id).toBe(original.id);
    expect(inner?.pubkey).toBe(AUTHOR);
    expect(inner?.content).toBe('hello');
  });

  it('returns null for empty content, so the e-tag path is used', () => {
    // Empty content is spec-legal and Primal has a rescue path for it.
    expect(embeddedRepostEvent({ content: '', kind: 6, tags: [] })).toBeNull();
  });

  it('returns null for a plain comment rather than throwing', () => {
    expect(embeddedRepostEvent({ content: 'nice post!', kind: 6, tags: [] })).toBeNull();
  });

  it('rejects JSON that is not an event', () => {
    expect(embeddedRepostEvent({ content: '{"foo":1}', kind: 6, tags: [] })).toBeNull();
  });

  it('accepts a verified embed even when the wrapper has no e tag', () => {
    // NIP-18 asks for the tag, but the inner event stands on its own
    // signature; a sloppy wrapper is not a reason to lose real content.
    const original = signedNote();
    const wrapper = repostOf(original, { tags: [] });
    expect(embeddedRepostEvent(wrapper)?.id).toBe(original.id);
  });

  describe('forgeries', () => {
    // The point of the change. Before it, any JSON with string `id` and
    // `pubkey` rendered as a full note card attributed to that pubkey.

    it('rejects an unsigned blob attributed to someone else', () => {
      const forged = ev({ id: 'f'.repeat(64), pubkey: AUTHOR, content: 'send sats to…', sig: '' });
      expect(embeddedRepostEvent(repostOf(forged))).toBeNull();
    });

    it('rejects a valid-looking signature made with the wrong key', () => {
      // The attacker signs the note with their own key, then swaps the
      // pubkey for the author's and recomputes the id so the hash matches.
      // The sig is 64 well-formed bytes; it just is not the author's.
      const attackerSigned = signedNote('send sats to…', ATTACKER_SK);
      const forged = asWire({ ...attackerSigned, pubkey: AUTHOR });
      const legit = signedNote('send sats to…'); // same template, so this is the id the author would have
      forged.id = legit.id;
      expect(forged.sig).toMatch(/^[0-9a-f]{128}$/);
      expect(embeddedRepostEvent(repostOf(forged))).toBeNull();
    });

    it('rejects a real signature carried over onto altered content', () => {
      // id and sig are the author's, the text is not: the recomputed hash
      // no longer matches `id`, which verifyEvent checks before the sig.
      const original = signedNote('I endorse nothing');
      const forged = asWire({ ...original, content: 'I endorse this scam' });
      expect(embeddedRepostEvent(repostOf(forged))).toBeNull();
    });

    it('rejects a correct signature over a different id', () => {
      // The signature verifies against `sig` + the author's key for note A,
      // but the blob claims to be note B. verifyEvent recomputes the hash
      // and compares it to `id` rather than trusting the field.
      const a = signedNote('note A');
      const b = signedNote('note B');
      const forged = asWire({ ...a, id: b.id });
      expect(embeddedRepostEvent(repostOf(forged, { tags: [['e', b.id]] }))).toBeNull();
    });

    it('rejects a verified note whose id is not the one the wrapper points at', () => {
      // Both notes are real; the wrapper says it reposts B but embeds A.
      // Rendering A under B's row would mis-collapse the feed.
      const a = signedNote('note A');
      const b = signedNote('note B');
      expect(embeddedRepostEvent(repostOf(a, { tags: [['e', b.id]] }))).toBeNull();
    });

    it('rejects a kind-6 whose embed is not a kind 1', () => {
      const article = finalizeEvent({ kind: 30023, created_at: 1700000000, tags: [['d', 'x']], content: '# hi' }, AUTHOR_SK);
      expect(embeddedRepostEvent(repostOf(article))).toBeNull();
    });

    it('rejects a kind-16 whose k tag disagrees with the embed', () => {
      const original = signedNote();
      const wrapper = repostOf(original, { kind: 16, tags: [['e', original.id], ['k', '30023']] });
      expect(embeddedRepostEvent(wrapper)).toBeNull();
    });

    it('cannot be pre-marked verified from JSON', () => {
      // nostr-tools memoises the verdict on a Symbol property. JSON has no
      // symbols, so a blob cannot smuggle one in; this pins that.
      const forged = ev({ id: 'f'.repeat(64), pubkey: AUTHOR, content: 'x', sig: 'a'.repeat(128) });
      const content = JSON.stringify({ ...forged, verified: true, 'Symbol(verified)': true });
      expect(embeddedRepostEvent({ content, kind: 6, tags: [] })).toBeNull();
    });
  });

  it('memoises the verdict per content string', () => {
    // A feed regroups on every page; verifying each repost each time would
    // be a schnorr check per repost per page.
    const spy = vi.spyOn(JSON, 'parse');
    const wrapper = repostOf(signedNote('memo'));
    embeddedRepostEvent(wrapper);
    const calls = spy.mock.calls.length;
    embeddedRepostEvent(wrapper);
    embeddedRepostEvent({ ...wrapper });
    expect(spy.mock.calls.length).toBe(calls);
    spy.mockRestore();
  });
});

describe('resolveRepost', () => {
  beforeEach(() => {
    data.fetchNote.mockReset();
  });

  it('returns the verified embed without touching the network', async () => {
    const original = signedNote();
    const result = await resolveRepost(repostOf(original));
    expect(result?.id).toBe(original.id);
    expect(data.fetchNote).not.toHaveBeenCalled();
  });

  it('falls through to the pool-verified fetch when the embed is forged', async () => {
    // The failure mode: not a blank, not a "could not verify" card under
    // the forged name: the note the e tag names, fetched through the pool.
    const real = signedNote('what the author actually wrote');
    const forged = asWire({ ...real, content: 'what the attacker wants you to read' });
    data.fetchNote.mockResolvedValue({
      id: real.id,
      pubkey: real.pubkey,
      content: real.content,
      createdAt: real.created_at,
      tags: real.tags,
    });
    const result = await resolveRepost(repostOf(forged, { tags: [['e', real.id]] }));
    expect(data.fetchNote).toHaveBeenCalledWith(real.id, undefined);
    expect(result?.content).toBe('what the author actually wrote');
  });
});

describe('groupReposts', () => {
  it('keeps every reposter of the same note, not just the first', () => {
    // The old dedupe discarded duplicates outright, so the count (the whole
    // signal a repost carries) was lost.
    const notes = [
      ev({ id: 'r1', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r2', pubkey: 'jb55', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r3', pubkey: 'alice', kind: 6, tags: [['e', 'popular']] }),
    ];
    const { notes: rows, repostersByTarget } = groupReposts(notes);
    expect(rows.map((n) => n.id)).toEqual(['r1']);
    expect(repostersByTarget.get('popular')).toEqual(['gigi', 'jb55', 'alice']);
  });

  it('counts one person reposting twice as one voucher', () => {
    const notes = [
      ev({ id: 'r1', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r2', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
    ];
    expect(groupReposts(notes).repostersByTarget.get('popular')).toEqual(['gigi']);
  });

  it('lets the original win the row when it is also in the window', () => {
    // Otherwise a note you already had appears twice: once alone, once
    // wrapped in someone's repost.
    const notes = [
      ev({ id: 'popular', pubkey: 'author' }),
      ev({ id: 'r1', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
    ];
    const { notes: rows, repostersByTarget } = groupReposts(notes);
    expect(rows.map((n) => n.id)).toEqual(['popular']);
    expect(repostersByTarget.get('popular')).toEqual(['gigi']);
  });

  it('keeps an unresolvable repost as its own row rather than dropping it', () => {
    const orphan = ev({ id: 'r1', kind: 6, tags: [] });
    expect(groupReposts([orphan]).notes.map((n) => n.id)).toEqual(['r1']);
  });

  it('preserves ordinary notes and their order', () => {
    const notes = [ev({ id: 'a' }), ev({ id: 'b' }), ev({ id: 'c' })];
    expect(groupReposts(notes).notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('records reposters newest-first, following the input order', () => {
    const notes = [
      ev({ id: 'r1', pubkey: 'newest', kind: 6, created_at: 300, tags: [['e', 'x']] }),
      ev({ id: 'r2', pubkey: 'oldest', kind: 6, created_at: 100, tags: [['e', 'x']] }),
    ];
    expect(groupReposts(notes).repostersByTarget.get('x')).toEqual(['newest', 'oldest']);
  });
});

describe('dedupeReposts', () => {
  it('keeps only the first repost of a given target', () => {
    // A popular note reposted by eight people you follow should occupy one
    // row, not eight consecutive ones.
    const notes = [
      ev({ id: 'r1', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r2', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r3', kind: 6, tags: [['e', 'other']] }),
    ];
    expect(dedupeReposts(notes).map((n) => n.id)).toEqual(['r1', 'r3']);
  });

  it('never collapses ordinary notes', () => {
    const notes = [ev({ id: 'a' }), ev({ id: 'b' })];
    expect(dedupeReposts(notes)).toHaveLength(2);
  });
});
