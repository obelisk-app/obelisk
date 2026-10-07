import { describe, expect, it } from 'vitest';
import { participantName } from '@/utils/voice/participant-name';
import { audibleTracks } from '@/utils/voice/audible-tracks';
import type { RemoteTrack } from '@/services/voice/client';

describe('participantName', () => {
  it('prefers the display name, then the name, then a short key', () => {
    expect(participantName({ displayName: 'Ada', name: 'ada' }, 'k'.repeat(64))).toBe('Ada');
    expect(participantName({ displayName: '', name: 'ada' }, 'k'.repeat(64))).toBe('ada');
    expect(participantName(null, 'abcdefghij')).toBe('abcdefgh');
  });
});

describe('audibleTracks', () => {
  it('keeps voices and screen audio, never video', () => {
    const tracks = (['audio', 'camera', 'screen', 'screen-audio'] as const).map((kind) => ({ kind, trackId: kind }) as unknown as RemoteTrack);
    expect(audibleTracks(tracks).map((t) => t.kind)).toEqual(['audio', 'screen-audio']);
  });
});
