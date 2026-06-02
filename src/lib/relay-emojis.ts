'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';
import { cacheGet, cacheSet } from '@/lib/nostr-bridge/cache';
import { KIND_EMOJI_SET } from '@/lib/nip-kinds';
import {
  customEmojiMapFromTags,
  isValidCustomEmojiName,
  normalizeCustomEmojiName,
  type CustomEmojiMap,
} from '@/lib/custom-emoji-tags';

export interface RelayEmoji {
  readonly name: string;
  readonly url: string;
}

export interface RelayEmojiSet {
  readonly title: string;
  readonly emojis: ReadonlyArray<RelayEmoji>;
  /** created_at of the source event, or 0 if none seen yet. */
  readonly updatedAt: number;
  readonly author?: string;
}

export const EMPTY_RELAY_EMOJI_SET: RelayEmojiSet = {
  title: '',
  emojis: [],
  updatedAt: 0,
};

export function relayEmojiSetDTag(relayUrl: string): string {
  return `obelisk:emojis:${relayUrl}`;
}

export function relayEmojiMap(set: RelayEmojiSet): CustomEmojiMap {
  const out: CustomEmojiMap = {};
  for (const emoji of set.emojis) out[emoji.name] = emoji.url;
  return out;
}

export function parseRelayEmojiSet(ev: NostrEvent): RelayEmojiSet {
  let title = '';
  const byName = new Map<string, RelayEmoji>();
  for (const tag of ev.tags) {
    if (tag[0] === 'title' && tag[1]) {
      title = tag[1];
      continue;
    }
    if (tag[0] !== 'emoji') continue;
    const name = normalizeCustomEmojiName(tag[1] ?? '');
    const url = tag[2]?.trim();
    if (!isValidCustomEmojiName(name) || !url) continue;
    byName.set(name, { name, url });
  }
  return {
    title,
    emojis: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: ev.created_at,
    author: ev.pubkey,
  };
}

export function toRelayEmojiSetTags(set: RelayEmojiSet, relayUrl: string): string[][] {
  const tags: string[][] = [
    ['d', relayEmojiSetDTag(relayUrl)],
    ['title', set.title.trim() || 'Obelisk emojis'],
  ];
  const seen = new Set<string>();
  for (const emoji of set.emojis) {
    const name = normalizeCustomEmojiName(emoji.name);
    const url = emoji.url.trim();
    if (!isValidCustomEmojiName(name) || !url || seen.has(name)) continue;
    seen.add(name);
    tags.push(['emoji', name, url]);
  }
  return tags;
}

export function relayEmojiSetFromMap(
  map: CustomEmojiMap,
  title = 'Obelisk emojis',
): RelayEmojiSet {
  return {
    title,
    emojis: Object.entries(map)
      .map(([name, url]) => ({ name: normalizeCustomEmojiName(name), url }))
      .filter((emoji) => isValidCustomEmojiName(emoji.name) && !!emoji.url)
      .sort((a, b) => a.name.localeCompare(b.name)),
    updatedAt: 0,
  };
}

export function subscribeRelayEmojiSet(
  relayUrl: string,
  authors: ReadonlyArray<string>,
  onChange: (set: RelayEmojiSet) => void,
): () => void {
  const impl = getBridgeImpl();
  if (!impl) {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void getBridge().then(() => {
      if (cancelled) return;
      unsub = subscribeRelayEmojiSet(relayUrl, authors, onChange);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }

  if (authors.length === 0) return () => {};
  const d = relayEmojiSetDTag(relayUrl);
  let latest: RelayEmojiSet = EMPTY_RELAY_EMOJI_SET;
  const cached = cacheGet<RelayEmojiSet>(relayUrl, KIND_EMOJI_SET, d);
  if (cached) {
    latest = cached.value;
    onChange(latest);
  }
  const filter: Filter = {
    kinds: [KIND_EMOJI_SET],
    authors: [...authors],
    '#d': [d],
  };
  return impl.subscribeFilterWatched(filter, (ev) => {
    if (ev.created_at <= latest.updatedAt) return;
    latest = parseRelayEmojiSet(ev);
    cacheSet(relayUrl, KIND_EMOJI_SET, d, latest);
    onChange(latest);
  });
}

export async function publishRelayEmojiSet(
  relayUrl: string,
  set: RelayEmojiSet,
): Promise<void> {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('nostr bridge not initialized');
  await impl.publishEvent(
    {
      kind: KIND_EMOJI_SET,
      content: '',
      tags: toRelayEmojiSetTags(set, relayUrl),
    },
    { extraRelays: [relayUrl], mode: 'replace' },
  );
}

export function useRelayEmojiSet(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
): RelayEmojiSet {
  const authorsKey = useMemo(() => [...authors].sort().join(','), [authors]);
  const stateKey = `${relayUrl ?? ''}|${authorsKey}`;
  const [state, setState] = useState<{ key: string; set: RelayEmojiSet }>({
    key: '',
    set: EMPTY_RELAY_EMOJI_SET,
  });
  useEffect(() => {
    if (!relayUrl || authors.length === 0) return;
    const key = stateKey;
    return subscribeRelayEmojiSet(relayUrl, authors, (set) => setState({ key, set }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayUrl, authorsKey, stateKey]);
  return state.key === stateKey ? state.set : EMPTY_RELAY_EMOJI_SET;
}

export { customEmojiMapFromTags };
