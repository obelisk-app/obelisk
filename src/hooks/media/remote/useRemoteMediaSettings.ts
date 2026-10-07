'use client';

import { useSyncExternalStore } from 'react';
import {
  getRemoteMediaSettings,
  subscribeRemoteMedia,
  type RemoteMediaSettings,
} from '@/services/media/remote-media';
import { REMOTE_MEDIA_DEFAULTS } from '@/constants/media/remote-media';

/** The remote-media load policy per surface, re-rendering on every change. */
export function useRemoteMediaSettings(): RemoteMediaSettings {
  return useSyncExternalStore(subscribeRemoteMedia, getRemoteMediaSettings, () => REMOTE_MEDIA_DEFAULTS);
}
