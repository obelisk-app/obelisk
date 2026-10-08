import { MEDIA_CATEGORIES } from '@/constants/chat/picker';
import { createLocalStore } from '@/services/common/local-store';
import type { RecentMediaEntry } from '@/utils/chat/picker/media-catalog';

const store = createLocalStore<unknown>('obelisk:recent-media', []);
const RECENT_MEDIA_LIMIT = 24;

function isRecentMediaEntry(value: unknown): value is RecentMediaEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === 'string' && typeof entry.url === 'string'
    && (entry.tab === 'gif' || entry.tab === 'sticker')
    && (entry.kind === undefined || entry.kind === 'emoji' || entry.kind === 'gif' || entry.kind === 'sticker')
    && (entry.packAddress === undefined || typeof entry.packAddress === 'string')
    && (entry.categories === undefined || (Array.isArray(entry.categories)
      && entry.categories.every((category) => MEDIA_CATEGORIES.some((known) => known === category))));
}

/** The last GIFs and stickers picked, newest first; empty on the server or on bad data. */
export function loadRecentMedia(): RecentMediaEntry[] {
  const value = store.load();
  return Array.isArray(value) ? value.filter(isRecentMediaEntry).slice(0, RECENT_MEDIA_LIMIT) : [];
}

/** Put `entry` first (dropping any older copy of its URL), persist, and return the new list. */
export function saveRecentMedia(entry: RecentMediaEntry): RecentMediaEntry[] {
  const next = [entry, ...loadRecentMedia().filter((item) => item.url !== entry.url)].slice(0, RECENT_MEDIA_LIMIT);
  store.save(next);
  return next;
}
