import type { RecentMediaEntry } from './media-catalog';

const RECENT_MEDIA_KEY = 'obelisk:recent-media';
const RECENT_MEDIA_LIMIT = 24;

/** The last GIFs and stickers picked, newest first; empty on the server or on bad data. */
export function loadRecentMedia(): RecentMediaEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_MEDIA_KEY) ?? '[]');
    return Array.isArray(value) ? value.slice(0, RECENT_MEDIA_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Put `entry` first (dropping any older copy of its URL), persist, and return the new list. */
export function saveRecentMedia(entry: RecentMediaEntry): RecentMediaEntry[] {
  const next = [entry, ...loadRecentMedia().filter((item) => item.url !== entry.url)].slice(0, RECENT_MEDIA_LIMIT);
  localStorage.setItem(RECENT_MEDIA_KEY, JSON.stringify(next));
  return next;
}
