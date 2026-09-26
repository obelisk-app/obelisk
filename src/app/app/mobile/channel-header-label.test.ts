import { describe, expect, it } from 'vitest';
import { channelHeaderLabel } from './PhoneShell';

/**
 * The header used to be one string, `"<category>/<channel>"`, in a single
 * nowrap line capped at 65vw beside a back button and three icon buttons —
 * so the ellipsis fell on the channel name and truncated the part you
 * actually needed to read.
 */
describe('channelHeaderLabel', () => {
  it('keeps the category and the channel apart', () => {
    const label = channelHeaderLabel({ name: '🙋 Introductions' }, { name: '𓉶Obelisk', id: 'p'.repeat(64) }, 'g1');
    expect(label).toEqual({ category: '𓉶Obelisk', channel: '🙋 Introductions' });
  });

  it('has no category for a top-level channel', () => {
    expect(channelHeaderLabel({ name: 'general' }, null, 'g1').category).toBeNull();
  });

  it('never glues the two together', () => {
    const label = channelHeaderLabel({ name: 'chat' }, { name: 'Space', id: 'p1' }, 'g1');
    expect(label.channel).not.toContain('/');
    expect(label.channel).toBe('chat');
  });

  it('falls back to a short id when a channel has no name', () => {
    expect(channelHeaderLabel(null, null, 'abcdef0123456789').channel).toBe('abcdef01');
  });

  it('falls back to a short id for an unnamed parent', () => {
    const parent = { name: null, id: 'abcdef0123456789' };
    expect(channelHeaderLabel({ name: 'chat' }, parent, 'g1').category).toBe('abcdef01');
  });
});
