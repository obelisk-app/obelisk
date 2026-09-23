import { describe, it, expect } from 'vitest';
import { replyParentOf } from './feed';

const ID = 'a'.repeat(64);
const AUTHOR = 'b'.repeat(64);

const note = (tags: string[][]) => ({ tags });

describe('replyParentOf', () => {
  it('returns null for a note that replies to nothing', () => {
    expect(replyParentOf(note([['p', AUTHOR]]))).toBeNull();
  });

  /**
   * The fifth slot is what lets "Replying to <name>" render without a relay
   * round trip, so it is the whole reason this helper exists.
   */
  it('reads the author and relay hint out of the reply tag', () => {
    const parent = replyParentOf(note([['e', ID, 'wss://relay.example', 'root', AUTHOR]]));
    expect(parent).toEqual({ id: ID, author: AUTHOR, relay: 'wss://relay.example' });
  });

  it('picks the reply marker over the root when a thread is nested', () => {
    const root = 'c'.repeat(64);
    const parent = replyParentOf(note([
      ['e', root, '', 'root', 'd'.repeat(64)],
      ['e', ID, '', 'reply', AUTHOR],
    ]));
    expect(parent?.id).toBe(ID);
    expect(parent?.author).toBe(AUTHOR);
  });

  it('survives a tag with no hints at all', () => {
    expect(replyParentOf(note([['e', ID, '', 'root']]))).toEqual({
      id: ID, author: null, relay: null,
    });
  });

  /**
   * These end up in a profile link and a relay connection, so anything that
   * is not plainly a pubkey or a `wss://` URL is dropped rather than passed
   * on — the tag is attacker-supplied.
   */
  it('rejects a malformed author', () => {
    expect(replyParentOf(note([['e', ID, '', 'root', 'not-a-pubkey']]))?.author).toBeNull();
  });

  it('rejects a relay hint that is not wss', () => {
    expect(replyParentOf(note([['e', ID, 'http://evil.example', 'root']]))?.relay).toBeNull();
  });

  it('normalises an uppercase author to lowercase hex', () => {
    const upper = AUTHOR.toUpperCase();
    expect(replyParentOf(note([['e', ID, '', 'root', upper]]))?.author).toBe(AUTHOR);
  });
});
