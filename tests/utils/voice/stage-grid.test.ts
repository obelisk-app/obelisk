import { describe, expect, it } from 'vitest';
import { audioGridClass, cameraStreamFor, togglePinned, videoGridClass } from '@/utils/voice/stage-grid';
import type { TracksByPubkey } from '@/utils/voice/stage-layout';
import type { RemoteTrack } from '@/services/voice/client';

describe('stage grids', () => {
  it('lays out cameras by count', () => {
    expect(videoGridClass(2)).toBe('grid-cols-1 sm:grid-cols-2');
    expect(videoGridClass(3)).toBe('grid-cols-1 sm:grid-cols-3');
    expect(videoGridClass(4)).toBe('grid-cols-2');
    expect(videoGridClass(7)).toBe('grid-cols-2 md:grid-cols-3 lg:grid-cols-4');
  });

  it('lays out audio-only people by count', () => {
    expect(audioGridClass(1)).toBe('grid-cols-1');
    expect(audioGridClass(2)).toBe('grid-cols-2');
    expect(audioGridClass(4)).toBe('grid-cols-2 sm:grid-cols-2');
    expect(audioGridClass(5)).toBe('grid-cols-2 sm:grid-cols-3 md:grid-cols-4');
  });
});

describe('cameraStreamFor', () => {
  const local = { id: 'local' } as unknown as MediaStream;
  const remote = { id: 'remote' } as unknown as MediaStream;
  const tracks: TracksByPubkey = new Map([['a', { camera: { stream: remote } as RemoteTrack }], ['b', {}]]);

  it('shows my own preview for me, the remote camera for others, else nothing', () => {
    expect(cameraStreamFor('me', 'me', local, tracks)).toBe(local);
    expect(cameraStreamFor('a', 'me', local, tracks)).toBe(remote);
    expect(cameraStreamFor('b', 'me', local, tracks)).toBeNull();
    expect(cameraStreamFor('c', 'me', local, tracks)).toBeNull();
  });
});

describe('togglePinned', () => {
  it('unpins the pinned person and pins anyone else', () => {
    expect(togglePinned('a', 'a')).toBeNull();
    expect(togglePinned('a', 'b')).toBe('b');
    expect(togglePinned(null, 'b')).toBe('b');
  });
});
