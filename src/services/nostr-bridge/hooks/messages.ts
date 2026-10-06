/**
 * Message hooks: a channel's kind 9 stream, its confidence status, paging
 * older history, reactions, profiles, and the DM threads.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferences } from '@/services/preferences';
import { getBridge } from '../client';
import type { JsDirectMessage, JsMessage, JsReaction, JsUserMetadata, LoadMoreMessagesResult, MessagesStatus } from '../types';
import { useSubscription } from './subscription';

export function useMessages(groupId: string | null): ReadonlyArray<JsMessage> {
  // The bridge owns durable message storage. Moderation/WoT decisions must be
  // non-destructive: they may hide/filter in UI paths, but they must not wipe
  // cached channel data just because a verdict or subscription-budget change
  // happened.
  return useSubscription<ReadonlyArray<JsMessage>>(
    (b, cb) => (groupId ? b.subscribeMessages(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

/**
 * Whole `messagesByGroup` map. Used by total-unread selectors that need to
 * iterate every channel without calling `useMessages` per group (which
 * would violate the rules of hooks under a list).
 */
export function useMessagesByGroup(): Readonly<Record<string, ReadonlyArray<JsMessage>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<JsMessage>>>>(
    (b, cb) => b.subscribeMessagesByGroup(cb),
    {},
  );
}

/**
 * Pagination control for a channel. The live REQ caps at the background
 * limit (see docs/data-system.md); this hook exposes a `loadEarlier`
 * action that pulls the next page of older messages on demand and a
 * `reachedStart` flag so the UI can stop offering "Load earlier" once the
 * relay returns no further history.
 */
export function useLoadEarlier(groupId: string | null): {
  loadEarlier: () => Promise<LoadMoreMessagesResult | null>;
  loading: boolean;
  reachedStart: boolean;
  lastResult: LoadMoreMessagesResult | null;
} {
  const [loading, setLoading] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [lastResult, setLastResult] = useState<LoadMoreMessagesResult | null>(null);
  const inFlightRef = useRef(false);
  const retryBlockedUntilRef = useRef(0);

  useEffect(() => {
    setReachedStart(false);
    setLastResult(null);
    retryBlockedUntilRef.current = 0;
  }, [groupId]);

  const loadEarlier = useCallback(async () => {
    if (!groupId || inFlightRef.current || reachedStart) return null;
    if (Date.now() < retryBlockedUntilRef.current) return null;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const bridge = await getBridge();
      const result = await bridge.loadMoreMessages(groupId);
      setLastResult(result);
      if (result === 'end') {
        setReachedStart(true);
      } else if (result === 'added') {
        setReachedStart(false);
        retryBlockedUntilRef.current = Date.now() + 250;
      } else {
        retryBlockedUntilRef.current = Date.now() + 1500;
      }
      return result;
    } catch {
      setLastResult('unavailable');
      retryBlockedUntilRef.current = Date.now() + 1500;
      return 'unavailable';
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [groupId, reachedStart]);

  return { loadEarlier, loading, reachedStart, lastResult };
}

export function useMessagesStatus(groupId: string | null): MessagesStatus {
  return useSubscription<MessagesStatus>(
    (b, cb) => (groupId ? b.subscribeMessagesStatus(groupId, cb) : () => {}),
    'loading',
    [groupId],
  );
}

export function useUserMetadata(pubkey: string | null): JsUserMetadata | null {
  return useSubscription<JsUserMetadata | null>(
    (b, cb) => (pubkey ? b.subscribeUserMetadata(pubkey, cb) : () => {}),
    null,
    [pubkey],
  );
}

export function useReactions(
  groupId: string | null,
): Readonly<Record<string, ReadonlyArray<JsReaction>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<JsReaction>>>>(
    (b, cb) => (groupId ? b.subscribeReactions(groupId, cb) : () => {}),
    {},
    [groupId],
  );
}

export function useDirectMessages(): Readonly<Record<string, ReadonlyArray<JsDirectMessage>>> {
  // Non-destructive store: muted/WoT-denied peers may be hidden by UI policy,
  // but the bridge does not delete DM history automatically.
  const dmEnabled = usePreferences().directMessagesEnabled;
  const [value, setValue] = useState<Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>>({});
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    if (!dmEnabled) {
      setValue({});
      return () => {};
    }
    getBridge().then((bridge) => {
      if (cancelled) return;
      unsub = bridge.subscribeDirectMessages(setValue);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [dmEnabled]);
  return value;
}
