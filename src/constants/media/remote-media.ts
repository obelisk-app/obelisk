/**
 * Media: remote media. Values the code in `services/media/remote-media.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { RemoteMediaSettings } from '@/services/media/remote-media';

export const REMOTE_MEDIA_DEFAULTS: Readonly<RemoteMediaSettings> = Object.freeze({
  channel: 'contacts',
  dm: 'ask',
});
