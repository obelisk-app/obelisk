/**
 * The signed-in account's followed hashtags, as one shared store.
 *
 * Every surface that offers a follow button needs the same answer to "is
 * this tag already followed", and a per-component fetch would both hammer
 * the relays and let two buttons for the same tag disagree. So: one fetch on
 * login, one optimistic list, and every button reads it.
 *
 * Optimism is deliberate. A relay round trip for a replaceable event takes
 * long enough that a button which waits for confirmation reads as broken;
 * the list flips immediately and rolls back if the publish throws.
 *
 * The React side is `useInterests` in `src/hooks/social/`.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import {
  fetchInterests,
  interestsFrom,
  publishInterests,
  toggleInterest,
} from './interests';

export interface InterestsState {
  /** null while the first fetch is in flight, distinct from "follows nothing". */
  tags: string[] | null;
  event: NostrEvent | null;
  pubkey: string | null;
}

let state: InterestsState = { tags: null, event: null, pubkey: null };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<InterestsState>) {
  state = { ...state, ...next };
  emit();
}

/** Listen for the list changing. Returns an unsubscribe. */
export function subscribeInterests(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The current state; the same object until something changes. */
export const getInterestsSnapshot = (): InterestsState => state;

/** Exposed for tests. */
export function __resetInterests(): void {
  state = { tags: null, event: null, pubkey: null };
  emit();
}

let loading: string | null = null;

/** Load the list for `pubkey` once. Safe to call on every render. */
export function ensureInterests(pubkey: string | null): void {
  if (!pubkey) {
    if (state.pubkey !== null) setState({ tags: null, event: null, pubkey: null });
    return;
  }
  if (state.pubkey === pubkey || loading === pubkey) return;
  loading = pubkey;
  // Clear first: showing the previous account's tags while the new ones load
  // would be wrong in the one way that matters.
  setState({ tags: null, event: null, pubkey });
  void fetchInterests(pubkey)
    .then((event) => {
      if (loading !== pubkey) return;
      setState({ event, tags: interestsFrom(event) });
    })
    .catch(() => {
      if (loading !== pubkey) return;
      // An unreachable relay is not evidence of an empty list, but the UI
      // needs *something*; an empty list with a working follow button lets
      // the reader carry on, and the next publish preserves what it finds.
      setState({ tags: [] });
    })
    .finally(() => { if (loading === pubkey) loading = null; });
}

/**
 * Follow or unfollow `tag` for the signed-in account: the list flips at once
 * and rolls back if the publish throws (the error is rethrown).
 */
export async function toggleFollowedInterest(tag: string): Promise<void> {
  const before = state.tags ?? [];
  const next = toggleInterest(before, tag);
  setState({ tags: next });
  try {
    await publishInterests(state.event, next);
  } catch (err) {
    setState({ tags: before });
    throw err;
  }
}
