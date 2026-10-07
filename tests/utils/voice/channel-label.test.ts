import { describe, expect, it } from 'vitest';
import { voiceChannelLabel } from '@/utils/voice/channel-label';

describe('voiceChannelLabel', () => {
  const groups = [{ id: 'a', name: 'Lounge' }, { id: 'b', name: '' }, { id: 'c' }, { id: 'd', name: null }];

  it('is the channel name when the channel is known', () => {
    expect(voiceChannelLabel(groups, 'a')).toBe('Lounge');
  });

  it('keeps an empty name empty', () => {
    expect(voiceChannelLabel(groups, 'b')).toBe('');
  });

  it('falls back to eight characters of the id and an ellipsis', () => {
    expect(voiceChannelLabel(groups, 'abcdef0123456789')).toBe('abcdef01…');
    expect(voiceChannelLabel(groups, 'c')).toBe('c…');
    expect(voiceChannelLabel(groups, 'd')).toBe('d…');
  });
});
