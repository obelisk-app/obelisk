import { describe, it, expect } from 'vitest';
import { scaffoldMentionSlotQuery, scaffoldMentionSlotRange, scaffoldSlots } from '@/utils/chat/slash/slash-scaffold';
import { SLASH_COMMANDS as COMMANDS } from '@/constants/chat/slash';

describe('scaffoldMentionSlotQuery', () => {
  it('returns the typed partial name when caret is inside the user slot', () => {
    // `/zap dum` with caret at end → query is "dum".
    expect(scaffoldMentionSlotQuery('/zap dum', 8)).toBe('dum');
  });

  it('returns empty string when the slot is open but unfilled', () => {
    expect(scaffoldMentionSlotQuery('/zap ', 5)).toBe('');
  });

  it('returns null when content is not a known slash command', () => {
    expect(scaffoldMentionSlotQuery('/notacmd foo', 12)).toBeNull();
  });

  it('strips a leading `@` from the partial query', () => {
    expect(scaffoldMentionSlotQuery('/zap @dum', 9)).toBe('dum');
  });
});

describe('scaffoldMentionSlotRange', () => {
  it('returns the absolute range of the active mention slot token', () => {
    // `/zap dum`: "dum" lives at chars 5..8.
    expect(scaffoldMentionSlotRange('/zap dum', 8)).toEqual({ start: 5, end: 8 });
  });

  it('returns null when the slot is empty (no token to replace)', () => {
    expect(scaffoldMentionSlotRange('/zap ', 5)).toBeNull();
  });

  it('returns null outside a known slash command', () => {
    expect(scaffoldMentionSlotRange('hello world', 11)).toBeNull();
  });

  it('returns null when the active slot is not a mention slot', () => {
    // After the user slot is filled and the caret moves to the amount slot,
    // the amount slot's `kind` is `number`, not `mention`.
    const input = '/zap nostr:npub1abc 1';
    expect(scaffoldMentionSlotRange(input, input.length)).toBeNull();
  });

  it('handles partial token mid-edit (caret inside the slot)', () => {
    // `/zap du|m`: caret at position 7, mid-token. The range still covers
    // the whole "dum" token so a picker selection replaces the entire slot.
    expect(scaffoldMentionSlotRange('/zap dum', 7)).toEqual({ start: 5, end: 8 });
  });
});

describe('scaffoldSlots', () => {
  const zap = COMMANDS.find((c) => c.name === 'zap')!;
  const play = COMMANDS.find((c) => c.name === 'play')!;

  it('is null with no parameters, another command, or only the command name', () => {
    expect(scaffoldSlots(play, '/play x', 7)).toBeNull();
    expect(scaffoldSlots(zap, '/play x', 7)).toBeNull();
    expect(scaffoldSlots(zap, '/zap', 4)).toBeNull();
  });

  it('fills slots from the typed arguments and marks the one under the caret', () => {
    const s = scaffoldSlots(zap, '/zap @ana ', 10)!;
    expect(s.prefix).toBe('/zap');
    expect(s.slots).toEqual([
      { name: 'user', text: '@ana', filled: true, active: false, optional: true },
      { name: 'amount', text: 'amount', filled: false, active: true, optional: true },
    ]);
    expect(s.activeParam?.name).toBe('amount');
  });
});
