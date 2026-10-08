/**
 * The user's own lists: contact list (and the follows derived from it), mute
 * list, and the media library.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { EMPTY_MEDIA_FAVORITES } from '@/constants/media/tags';
import type { JsMediaFavorites, JsMediaPack } from '../common/types';
import { useSubscription } from './subscription';
import { contactFollows } from '../lists/follows';

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
  return contactFollows(useMyContactList()).list;
}

/** Shared membership index for rows that only need to check one author. */
export function useMyFollowSet(): ReadonlySet<string> {
  return contactFollows(useMyContactList()).set;
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
