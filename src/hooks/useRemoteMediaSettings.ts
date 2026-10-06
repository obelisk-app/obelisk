'use client';

import { useSyncExternalStore } from 'react';
import {
  getRemoteMediaSettings,
  REMOTE_MEDIA_DEFAULTS,
  subscribeRemoteMedia,
  type RemoteMediaSettings,
} from '@/services/remote-media';

/** The remote-media load policy per surface, re-rendering on every change. */
export function useRemoteMediaSettings(): RemoteMediaSettings {
  return useSyncExternalStore(subscribeRemoteMedia, getRemoteMediaSettings, () => REMOTE_MEDIA_DEFAULTS);
}
