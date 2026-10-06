'use client';

import { useEffect, useState } from 'react';
import { nostrActions, type RelayAccessState } from '@/services/nostr-bridge';

/**
 * The two "have we waited long enough" gates behind the channel-missing
 * verdict: the grace window after opening a channel, and the focused kind
 * 39000 fetch for a channel the bridge does not know yet.
 */
export function useChannelLoadGates(groupId: string, groupKnown: boolean) {
  // Grace window for the *channel-missing* verdict (kind 39000), which
  // still uses the simpler "EOSE + dwell" gate. The bridge owns kind 9
  // confidence directly; this timer only matters for the
  // "Channel not visible on this relay" copy.
  // Keyed on the channel so a new channel starts its own grace window with
  // no reset step: a stamp for another channel simply does not count.
  const [graceElapsedFor, setGraceElapsedFor] = useState<string | null>(null);
  const channelMissingGrace = graceElapsedFor === groupId;
  useEffect(() => {
    const t = setTimeout(() => setGraceElapsedFor(groupId), 5000);
    return () => clearTimeout(t);
  }, [groupId]);
  // Force-fetch kind 39000 for the channel if the bridge doesn't have it
  // yet. Without this the user would stare at "Loading channel info…"
  // for the entire global-metadata stream, or, worse, hit "Channel not
  // visible" if the stream EOSE'd before this specific id arrived. The
  // focused querySync is cheap (limit: 1) and unblocks the chat pane on
  // every navigation, with or without cache.
  //
  // `metadataFetchDone` flips true after the focused query resolves
  // (either way). It gates the final "channel not visible" verdict so
  // we never declare a channel missing until we've actually tried.
  //
  // Stamped with the channel the fetch was for, so a navigation starts a
  // fresh attempt with no reset step; no channel, or a channel the bridge
  // already knows, counts as done without a fetch.
  const [metadataFetchedFor, setMetadataFetchedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!groupId || groupKnown) return;
    let cancelled = false;
    void nostrActions
      .fetchGroupMetadata(groupId)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setMetadataFetchedFor(groupId);
      });
    return () => {
      cancelled = true;
    };
    // Only re-fire on groupId change. `group` is read for the early-exit:
    // if it arrives mid-fetch, we still flip done on resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
  const metadataFetchDone = !groupId || groupKnown || metadataFetchedFor === groupId;
  return { channelMissingGrace, metadataFetchDone };
}

/**
 * Lazy creator-admin claim. The blanket login-time loop that used to
 * publish a kind 9000 ['admin'] for every visible group has been removed.
 * Instead, when the active session opens a channel they themselves
 * created (kind 9007 author == myPubkey) and the relay hasn't already
 * listed them in 39001, fire exactly one kind 9000 ['admin']. The
 * localStorage key persists across sessions so this never re-fires.
 */
export function useCreatorAdminClaim({
  groupId, myPubkey, groupCreator, admins, relay, relayAccess,
}: {
  groupId: string;
  myPubkey: string | null;
  groupCreator: string | null;
  admins: ReadonlyArray<string>;
  relay: string;
  relayAccess: RelayAccessState;
}) {
  useEffect(() => {
    if (!myPubkey || !groupCreator) return;
    if (groupCreator !== myPubkey) return;
    if (admins.includes(myPubkey)) return;
    // Same gate as the lazy member putUser: don't fire kind 9000 against
    // a relay that's already telling us we can't write. Otherwise the
    // user sees a "Publishing to relays / restricted: not whitelisted"
    // toast every time they open a channel they happen to have created
    // on a different relay.
    if (relayAccess !== 'ok') return;
    const key = `obelisk:claimed-admin:${relay}:${groupId}:${myPubkey}`;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(key)) return;
      localStorage?.setItem(key, '1');
    } catch {}
    void nostrActions.claimCreatorAdmin(groupId).catch((err) => {
      console.debug('[appshell] claimCreatorAdmin skipped (relay declined)', err);
    });
  }, [groupId, myPubkey, groupCreator, admins, relay, relayAccess]);
}
