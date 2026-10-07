import { describe, expect, it } from 'vitest';
import { isVoiceDebugOn, passiveCallCount, voiceRoomDisplayName } from '@/utils/voice/room-view';

describe('room view helpers', () => {
  it('names the room after the channel, or a short id', () => {
    expect(voiceRoomDisplayName('Lounge', 'x'.repeat(40))).toBe('Lounge');
    expect(voiceRoomDisplayName(undefined, 'abcdefghijklmnopqrst')).toBe('abcdefghijklmnop…');
  });

  it('counts the larger of the SFU count and the faces seen, ignoring an unknown count', () => {
    expect(passiveCallCount(null)).toBe(0);
    expect(passiveCallCount({ participantCount: 5, participantPubkeys: ['a', 'b'] })).toBe(5);
    expect(passiveCallCount({ participantCount: -1, participantPubkeys: ['a', 'b'] })).toBe(2);
    expect(passiveCallCount({ participantCount: 0, participantPubkeys: undefined })).toBe(0);
  });

  it('turns the overlay on only for ?debug=voice', () => {
    expect(isVoiceDebugOn('?debug=voice')).toBe(true);
    expect(isVoiceDebugOn('?debug=other')).toBe(false);
    expect(isVoiceDebugOn('')).toBe(false);
  });
});
