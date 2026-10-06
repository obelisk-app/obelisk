'use client';

import { useSyncExternalStore } from 'react';
import { getActivitySnapshot, subscribeActivity, type ActivityEntry } from '@/services/activity-log';

/** The activity log, newest first, re-rendering on every change. */
export function useActivityLog(): ActivityEntry[] {
  return useSyncExternalStore(subscribeActivity, getActivitySnapshot, getActivitySnapshot);
}
