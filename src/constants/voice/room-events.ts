/**
 * Voice: room events. Values the code in `services/voice/room-events.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { LocalTrackFlags, LocalVideoTracks } from '@/services/voice/room-events';

export const NO_LOCAL: LocalTrackFlags = { mic: false, camera: false, screen: false };

export const NO_LOCAL_VIDEO: LocalVideoTracks = { camera: null, screen: null };
