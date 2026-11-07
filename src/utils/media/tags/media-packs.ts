import { mergePackItems } from '@/utils/media/library/pack-utils';
import { parseHttpUrl } from '@/utils/url/http-url';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  isValidCustomEmojiName,
  normalizeCustomEmojiName,
} from './custom-emoji-tags';
import type {
  JsMediaFavorites,
  JsMediaItem,
  JsMediaKind,
  JsMediaPack,
} from '@/services/nostr-bridge';
import { inferMediaKind } from './media-kind';

const PACK_ADDRESS_RE = /^30030:[0-9a-f]{64}:.+$/;

function mediaKinds(tags: ReadonlyArray<ReadonlyArray<string>>): Map<string, JsMediaKind> {
  const kinds = new Map<string, JsMediaKind>();
  for (const tag of tags) {
    if (tag[0] !== 'media') continue;
    const name = normalizeCustomEmojiName(tag[1] ?? '');
    const kind = tag[2];
    if (name && (kind === 'emoji' || kind === 'gif' || kind === 'sticker')) kinds.set(name, kind);
  }
  return kinds;
}

function mediaItems(tags: ReadonlyArray<ReadonlyArray<string>>, fallbackAddress?: string): JsMediaItem[] {
  const kinds = mediaKinds(tags);
  const items: JsMediaItem[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'emoji') continue;
    const name = normalizeCustomEmojiName(tag[1] ?? '');
    const url = parseHttpUrl(tag[2])?.href ?? '';
    if (!isValidCustomEmojiName(name) || !url) continue;
    const packAddress = PACK_ADDRESS_RE.test(tag[3] ?? '') ? tag[3] : fallbackAddress;
    items.push({
      name,
      url,
      kind: kinds.get(name) ?? inferMediaKind(url),
      ...(packAddress ? { packAddress } : {}),
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function mediaPackAddress(author: string, identifier: string): string {
  return `30030:${author}:${identifier}`;
}

export function parseMediaPack(ev: NostrEvent): JsMediaPack | null {
  const identifier = ev.tags.find((tag) => tag[0] === 'd')?.[1]?.trim() ?? '';
  if (!identifier) return null;
  const address = mediaPackAddress(ev.pubkey, identifier);
  const value = (name: string) => ev.tags.find((tag) => tag[0] === name)?.[1]?.trim() ?? '';
  return {
    address,
    identifier,
    author: ev.pubkey,
    title: value('title') || identifier,
    description: value('description'),
    image: parseHttpUrl(value('image'))?.href ?? '',
    items: mediaItems(ev.tags, address),
    createdAt: ev.created_at,
  };
}

export function parseMediaFavorites(ev: NostrEvent): JsMediaFavorites {
  return {
    items: mediaItems(ev.tags),
    packAddresses: Array.from(new Set(
      ev.tags
        .filter((tag) => tag[0] === 'a' && PACK_ADDRESS_RE.test(tag[1] ?? ''))
        .map((tag) => tag[1]),
    )),
    createdAt: ev.created_at,
  };
}

function itemTags(items: ReadonlyArray<JsMediaItem>): string[][] {
  const tags: string[][] = [];
  for (const item of mergePackItems([], items)) {
    const name = normalizeCustomEmojiName(item.name);
    const url = parseHttpUrl(item.url)?.href ?? '';
    if (!isValidCustomEmojiName(name) || !url) continue;
    tags.push(item.packAddress
      ? ['emoji', name, url, item.packAddress]
      : ['emoji', name, url]);
    tags.push(['media', name, item.kind]);
  }
  return tags;
}

export function mediaPackTags(
  pack: Pick<JsMediaPack, 'identifier' | 'title' | 'description' | 'image' | 'items'>,
  author: string,
): string[][] {
  const identifier = pack.identifier.trim();
  if (!identifier) throw new Error('Pack identifier is required.');
  const address = mediaPackAddress(author, identifier);
  const image = parseHttpUrl(pack.image)?.href;
  const items = pack.items.map((item) => ({ ...item, packAddress: item.packAddress ?? address }));
  return [
    ['d', identifier],
    ['title', pack.title.trim() || identifier],
    ...(pack.description.trim() ? [['description', pack.description.trim()]] : []),
    ...(image ? [['image', image]] : []),
    ...itemTags(items),
  ];
}

export function mediaFavoriteTags(favorites: JsMediaFavorites): string[][] {
  return [
    ...Array.from(new Set(favorites.packAddresses))
      .filter((address) => PACK_ADDRESS_RE.test(address))
      .map((address) => ['a', address]),
    ...itemTags(favorites.items),
  ];
}

export function mediaItemsFromPacks(
  packAddresses: ReadonlyArray<string>,
  packs: Readonly<Record<string, JsMediaPack>>,
): JsMediaItem[] {
  return mergePackItems([], packAddresses.flatMap((address) => packs[address]?.items ?? []));
}
