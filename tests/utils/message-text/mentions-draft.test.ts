import { describe, expect, it } from 'vitest';
import { hexToNpub } from '@nostr-wot/data';
import * as draft from '@/utils/message-text/mentions-draft';
import * as entry from '@/utils/message-text/mentions';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('mentions-draft', () => {
  it('inserts a prose mention and resolves it back to the npub at send time', () => {
    const { next, mention } = draft.applyMentionToDraft('hi @al', 6, ALICE, { displayName: 'Alice' });
    expect(next).toBe('hi @Alice ');
    expect(mention).toEqual({ token: '@Alice', pubkey: ALICE });
    expect(draft.resolveDraftMentions(next, [mention!, mention!])).toBe(`hi nostr:${hexToNpub(ALICE)} `);
  });

  it('resolves the longer of two overlapping names first', () => {
    const out = draft.resolveDraftMentions('@Al and @Alice', [
      { token: '@Al', pubkey: BOB },
      { token: '@Alice', pubkey: ALICE },
    ]);
    expect(out).toBe(`nostr:${hexToNpub(BOB)} and nostr:${hexToNpub(ALICE)}`);
  });

  it('closes the slot once a non-word character is typed', () => {
    expect(draft.detectMentionQuery('hey @bo', 7)).toBe('bo');
    expect(draft.detectMentionQuery('hey @bo!', 8)).toBeNull();
  });

  it('is what the mentions entry point re-exports', () => {
    expect(entry.applyMentionToDraft).toBe(draft.applyMentionToDraft);
    expect(entry.resolveDraftMentions).toBe(draft.resolveDraftMentions);
    expect(entry.detectMentionQuery).toBe(draft.detectMentionQuery);
  });
});
