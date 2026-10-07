import { describe, expect, it } from 'vitest';
import { channelRowClass, isVoiceKind, rowAttention, rowCount } from '@/utils/shell/mobile/channel-row';

const NL = String.fromCharCode(10);

describe('channelRowClass', () => {
  it('lists the row states newline-joined, in a fixed order', () => {
    expect(channelRowClass({ unread: 0 })).toBe('ch-row');
    expect(channelRowClass({ active: true, unread: 2, indent: true, split: true })).toBe(['ch-row', 'active', 'unread', 'ch-thread', 'ch-row-split'].join(NL));
  });
});

describe('rowCount', () => {
  it('caps at 99+', () => {
    expect(rowCount(99)).toBe(99);
    expect(rowCount(100)).toBe('99+');
  });
});

describe('rowAttention', () => {
  it('silences an unfollowed channel traffic but not its mentions', () => {
    expect(rowAttention({ unread: 5, mentions: 1, replies: 1 }, 0, true)).toEqual({ unread: 0, mentionsOrReplies: 2 });
  });

  it('takes the larger of the loaded highlights and the mention cards', () => {
    expect(rowAttention({ unread: 5, mentions: 0, replies: 0 }, 3, false)).toEqual({ unread: 5, mentionsOrReplies: 3 });
  });
});

describe('isVoiceKind', () => {
  it('is true for both voice kinds only', () => {
    expect(isVoiceKind('voice')).toBe(true);
    expect(isVoiceKind('voice-sfu')).toBe(true);
    expect(isVoiceKind('forum')).toBe(false);
  });
});
