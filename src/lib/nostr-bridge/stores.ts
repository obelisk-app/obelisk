/**
 * React hooks backed by the bridge's StateFlow subscriptions.
 *
 * Each hook subscribes on mount, replays the latest value, and
 * unsubscribes on unmount.
 */
import { useEffect, useState } from 'react';
import { getBridge } from './client';
import type { JsGroup, JsMessage, JsUserMetadata, JsReaction, JsDirectMessage, RelayAccessState } from './types';

function normalizeRelayUrl(u: string): string {
  return u.replace(/\/+$/, '').toLowerCase();
}

function useSubscription<T>(
  subscribe: (
    bridge: Awaited<ReturnType<typeof getBridge>>,
    cb: (value: T) => void,
  ) => () => void,
  initial: NoInfer<T>,
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

/**
 * NIP-42 / whitelist access state for a specific relay (defaults to the
 * currently-active one). `'unknown'` until the relay either delivers an
 * event/EOSE (→ `'ok'`) or sends a CLOSED reason we can classify.
 */
export function useRelayAccess(url?: string | null): RelayAccessState {
  const current = useCurrentRelayUrl();
  const target = (url ?? current) || '';
  const map = useSubscription<Readonly<Record<string, RelayAccessState>>>(
    (b, cb) => b.subscribeRelayAccess(cb),
    {},
  );
  if (!target) return 'unknown';
  return map[normalizeRelayUrl(target)] ?? 'unknown';
}

/**
 * The local user's pubkey hex, or `null` when logged out. Single source of
 * truth for "who am I" — replaces the legacy `useAuthStore(s => s.profile.pubkey)`.
 */
export function useMyPubkey(): string | null {
  return useSubscription<string | null>((b, cb) => b.subscribeMyPubkey(cb), null);
}

/**
 * `true` once the active NIP-46 bunker signer has handshaken with its
 * bunker relay. For nsec/NIP-07 sessions this stays `false` (no external
 * signer to wait for). UI components that need a generic "ready to publish"
 * gate should use {@link useSignerReady} instead.
 */
export function useBunkerSignerReady(): boolean {
  return useSubscription((b, cb) => b.subscribeBunkerSignerReady(cb), false);
}

/**
 * The active session's login method, or `null` when logged out.
 */
export function useMyLoginMethod(): 'nsec' | 'nip07' | 'bunker' | null {
  return useSubscription<'nsec' | 'nip07' | 'bunker' | null>(
    (b, cb) => b.subscribeMyLoginMethod(cb),
    null,
  );
}

/**
 * Generic "the bridge can sign and publish events for the active user".
 * `true` for nsec/NIP-07 once logged in; for bunker it additionally requires
 * the BunkerSigner to have handshaken with its bunker relay.
 */
export function useSignerReady(): boolean {
  const loggedIn = useIsLoggedIn();
  const method = useMyLoginMethod();
  const bunkerReady = useBunkerSignerReady();
  if (!loggedIn) return false;
  if (method === 'bunker') return bunkerReady;
  return method !== null;
}

export function useConfiguredRelays(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeConfiguredRelays(cb), []);
}

export function useGroups(): ReadonlyArray<JsGroup> {
  return useSubscription<ReadonlyArray<JsGroup>>((b, cb) => b.subscribeGroups(cb), []);
}

export function useMessages(groupId: string | null): ReadonlyArray<JsMessage> {
  return useSubscription<ReadonlyArray<JsMessage>>(
    (b, cb) => (groupId ? b.subscribeMessages(groupId, cb) : () => {}),
    [],
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

export function useChildrenByParent(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>((b, cb) => b.subscribeChildrenByParent(cb), {});
}

export function useDirectMessages(): Readonly<Record<string, ReadonlyArray<JsDirectMessage>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>>((b, cb) => b.subscribeDirectMessages(cb), {});
}

export function useAdmins(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeAdmins(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useAdminsByGroup(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription((b, cb) => b.subscribeAdminsByGroup(cb), {});
}

export function useMembers(groupId: string | null): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>(
    (b, cb) => (groupId ? b.subscribeMembers(groupId, cb) : () => {}),
    [],
    [groupId],
  );
}

export function useMyFollows(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeMyFollows(cb), []);
}
