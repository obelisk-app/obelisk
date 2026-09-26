import { describe, expect, it } from 'vitest';
import { classifyGroupPing, groupPingTitle, previewText, replyTargetId } from './classify';

const ME = 'a'.repeat(64);
const THEM = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);

describe('classifyGroupPing', () => {
  it('never pings for my own events', () => {
    expect(classifyGroupPing({ pubkey: ME, tags: [['p', ME]], mentions: [ME] }, ME)).toBeNull();
  });

  it('returns null when logged out', () => {
    expect(classifyGroupPing({ pubkey: THEM, tags: [], mentions: [ME] }, null)).toBeNull();
  });

  it('classifies an explicit mention', () => {
    expect(classifyGroupPing({ pubkey: THEM, tags: [], mentions: [ME] }, ME)).toBe('mention');
  });

  it('classifies a reply whose loaded parent is mine', () => {
    const tags = [['e', 'parent', '', 'reply']];
    expect(classifyGroupPing({ pubkey: THEM, tags, mentions: [], parentAuthor: ME }, ME)).toBe('reply');
  });

  it('falls back to the p tag when the parent is not loaded', () => {
    const tags = [['e', 'parent', '', 'reply'], ['p', ME]];
    expect(classifyGroupPing({ pubkey: THEM, tags, mentions: [ME], parentAuthor: null }, ME)).toBe('reply');
  });

  it('treats a reply to someone else that also @s me as a mention', () => {
    const tags = [['e', 'parent', '', 'reply'], ['p', OTHER], ['p', ME]];
    expect(classifyGroupPing({ pubkey: THEM, tags, mentions: [OTHER, ME], parentAuthor: OTHER }, ME)).toBe('mention');
  });

  it('ignores ordinary traffic and replies to others', () => {
    expect(classifyGroupPing({ pubkey: THEM, tags: [], mentions: [] }, ME)).toBeNull();
    const tags = [['e', 'parent', '', 'reply'], ['p', OTHER]];
    expect(classifyGroupPing({ pubkey: THEM, tags, mentions: [OTHER], parentAuthor: OTHER }, ME)).toBeNull();
  });

  it('only counts marked reply e-tags', () => {
    expect(replyTargetId([['e', 'root', '', 'root']])).toBeNull();
    expect(replyTargetId([['e', 'x', '', 'reply']])).toBe('x');
  });
});

describe('alert text', () => {
  it('builds titles', () => {
    expect(groupPingTitle('reply', 'Ana', '#general')).toBe('Ana replied to you in #general');
    expect(groupPingTitle('mention', 'Ana', null)).toBe('Ana mentioned you');
  });

  it('collapses nostr URIs and whitespace, and truncates', () => {
    expect(previewText('hi  nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\nthere')).toBe('hi @… there');
    expect(previewText('x'.repeat(200), 10)).toHaveLength(10);
  });
});
