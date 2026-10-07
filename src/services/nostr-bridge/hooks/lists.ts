/**
 * The user's own lists: contact list (and the follows derived from it), mute
 * list, and the media library.
 */
import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { EMPTY_MEDIA_FAVORITES } from '@/utils/media/tags/media-packs';
import type { JsMediaFavorites, JsMediaPack } from '../common/types';
import { useSubscription } from './subscription';

export function useMyContactList(): NostrEvent | null {
  return useSubscription<NostrEvent | null>((b, cb) => b.subscribeMyContactList(cb), null);
}

export function useMyContactListReady(): boolean {
  return useSubscription((b, cb) => b.subscribeMyContactListReady(cb), false);
}

export function useMediaPacks(): Readonly<Record<string, JsMediaPack>> {
  return useSubscription<Readonly<Record<string, JsMediaPack>>>(
    (b, cb) => b.subscribeMediaPacks(cb), {},
  );
}

export function useMyMediaFavorites(): JsMediaFavorites {
  return useSubscription<JsMediaFavorites>(
    (b, cb) => b.subscribeMyMediaFavorites(cb), EMPTY_MEDIA_FAVORITES,
  );
}

export function useMyFollows(): ReadonlyArray<string> {
  const event = useMyContactList();
  return useMemo(() => {
    if (!event) return [];
    const seen = new Set<string>();
    for (const tag of event.tags) {
      const pubkey = tag[0] === 'p' ? tag[1]?.toLowerCase() : null;
      if (pubkey && /^[0-9a-f]{64}$/.test(pubkey)) seen.add(pubkey);
    }
    return Array.from(seen);
  }, [event]);
}

/**
 * NIP-51 kind 10000 mute list for the local user. `useMessages` and
 * `useDirectMessages` already apply this filter; use this hook directly when
 * rendering UI that needs to know whether a specific pubkey is muted (e.g.
 * the profile popover's mute/unmute toggle).
 */
export function useMyMutes(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeMyMutes(cb), []);
}
