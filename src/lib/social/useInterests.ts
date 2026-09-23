'use client';

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
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyPubkey } from '../nostr-bridge';
import {
  fetchInterests,
  interestsFrom,
  publishInterests,
  toggleInterest,
} from './interests';

interface State {
  /** null while the first fetch is in flight — distinct from "follows nothing". */
  tags: string[] | null;
  event: NostrEvent | null;
  pubkey: string | null;
}

let state: State = { tags: null, event: null, pubkey: null };
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const snapshot = () => state;

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

export interface InterestsApi {
  /** null while loading. */
  tags: string[] | null;
  isFollowing: (tag: string) => boolean;
  toggle: (tag: string) => Promise<void>;
  ready: boolean;
}

export function useInterests(): InterestsApi {
  const myPubkey = useMyPubkey();
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);

  ensureInterests(myPubkey ?? null);

  const tags = current.pubkey === (myPubkey ?? null) ? current.tags : null;

  const isFollowing = useCallback(
    (tag: string) => (tags ?? []).includes(tag.trim().replace(/^#+/, '').toLowerCase()),
    [tags],
  );

  const toggle = useCallback(async (tag: string) => {
    if (!myPubkey) return;
    const before = state.tags ?? [];
    const next = toggleInterest(before, tag);
    setState({ tags: next });
    try {
      await publishInterests(state.event, next);
    } catch (err) {
      setState({ tags: before });
      throw err;
    }
  }, [myPubkey]);

  return { tags, isFollowing, toggle, ready: tags !== null };
}
