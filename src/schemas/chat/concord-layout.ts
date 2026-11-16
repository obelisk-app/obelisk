import type { ChannelLayout } from '@/services/relay/channel-layout';

/** Bound and normalize the encrypted Obelisk layout extension before rendering it. */
export function parseConcordLayout(raw: unknown): ChannelLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.categories) || !Array.isArray(value.channels)) return null;
  const categories: ChannelLayout['categories'][number][] = [];
  const ids = new Set<string>();
  for (const item of value.categories.slice(0, 128)) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 || ids.has(item.id) || typeof item.name !== 'string') continue;
    ids.add(item.id);
    categories.push({ id: item.id, name: item.name.slice(0, 120), position: categories.length });
  }
  const seen = new Set<string>();
  const channels: ChannelLayout['channels'][number][] = [];
  for (const item of value.channels.slice(0, 1000)) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 || seen.has(item.id)) continue;
    seen.add(item.id);
    channels.push({ id: item.id, categoryId: ids.has(item.categoryId) ? item.categoryId : null, position: channels.length });
  }
  return { categories, channels, updatedAt: typeof value.updatedAt === 'number' && Number.isSafeInteger(value.updatedAt) ? value.updatedAt : 0 };
}
