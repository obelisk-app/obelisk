/**
 * React hooks backed by the bridge's StateFlow subscriptions.
 *
 * Each hook subscribes on mount, replays the latest value, and
 * unsubscribes on unmount.
 */
import { useEffect, useState } from 'react';
import { getBridge } from './client';
import type { JsGroup, JsMessage, JsUserMetadata, JsReaction, JsDirectMessage } from './types';

function useSubscription<T>(
  subscribe: (
    bridge: Awaited<ReturnType<typeof getBridge>>,
    cb: (value: T) => void,
  ) => () => void,
  initial: T,
  deps: ReadonlyArray<unknown> = [],
): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    getBridge().then((bridge) => {
      if (cancelled) return;
      unsub = subscribe(bridge, setValue);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useIsLoggedIn(): boolean {
  return useSubscription((b, cb) => b.subscribeIsLoggedIn(cb), false);
}

export function useConnectionState(): string {
  return useSubscription((b, cb) => b.subscribeConnectionState(cb), 'Disconnected');
}

export function useCurrentRelayUrl(): string {
  return useSubscription((b, cb) => b.subscribeCurrentRelayUrl(cb), '');
}

export function useConfiguredRelays(): ReadonlyArray<string> {
  return useSubscription((b, cb) => b.subscribeConfiguredRelays(cb), []);
}

export function useGroups(): ReadonlyArray<JsGroup> {
  return useSubscription((b, cb) => b.subscribeGroups(cb), []);
}

export function useMessages(groupId: string | null): ReadonlyArray<JsMessage> {
  return useSubscription(
    (b, cb) => (groupId ? b.subscribeMessages(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useUserMetadata(pubkey: string | null): JsUserMetadata | null {
  return useSubscription(
    (b, cb) => (pubkey ? b.subscribeUserMetadata(pubkey, cb) : () => {}),
    null,
    [pubkey],
  );
}

export function useReactions(
  groupId: string | null,
): Readonly<Record<string, ReadonlyArray<JsReaction>>> {
  return useSubscription(
    (b, cb) => (groupId ? b.subscribeReactions(groupId, cb) : () => {}),
    {},
    [groupId],
  );
}

export function useChildrenByParent(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeChildrenByParent(cb), {});
}

export function useDirectMessages(): Readonly<Record<string, ReadonlyArray<JsDirectMessage>>> {
  return useSubscription((b, cb) => b.subscribeDirectMessages(cb), {});
}

export function useAdmins(groupId: string | null): ReadonlyArray<string> {
  return useSubscription(
    (b, cb) => (groupId ? b.subscribeAdmins(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useMembers(groupId: string | null): ReadonlyArray<string> {
  return useSubscription(
    (b, cb) => (groupId ? b.subscribeMembers(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useMyFollows(): ReadonlyArray<string> {
  return useSubscription((b, cb) => b.subscribeMyFollows(cb), []);
}
