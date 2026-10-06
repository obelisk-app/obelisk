/**
 * One channel's messages from the bridge's already-loaded map, read without
 * re-rendering on every other channel's traffic.
 *
 * A sidebar draws one row per channel. Subscribing each row to the whole
 * messages-by-group map (`useMessagesByGroup`) meant a single message in any
 * channel re-rendered every row. Here all rows share ONE bridge
 * subscription, and each row reads its own group through
 * `useSyncExternalStore`, which re-renders a component only when the value
 * it selected changed. The bridge replaces only the touched group's array on
 * ingest, so a message re-renders its own row and nothing else.
 *
 * Like `useMessagesByGroup`, this opens no relay subscription: it reads what
 * the bridge has already loaded (`subscribeMessages(groupId)` would start a
 * per-channel stream, a REQ burst for a long channel list).
 *
 * Built on the bridge's public `getBridge()` + `subscribeMessagesByGroup`,
 * not on the bridge's `useSubscription` hook. The React side is
 * `useCachedGroupMessages` in `src/hooks/read-state/`.
 */
import { getBridge, type JsMessage } from '@/services/nostr-bridge';

type ByGroup = Readonly<Record<string, ReadonlyArray<JsMessage>>>;

const EMPTY: ByGroup = {};

let latest: ByGroup = EMPTY;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;
/** Bumped on every attach and detach, so a bridge promise from an older attach is ignored. */
let generation = 0;

function attach(): void {
  const mine = ++generation;
  void getBridge().then((bridge) => {
    if (mine !== generation) return;
    unsubscribe = bridge.subscribeMessagesByGroup((byGroup) => {
      latest = byGroup;
      listeners.forEach((listener) => listener());
    });
  });
}

function detach(): void {
  generation++;
  unsubscribe?.();
  unsubscribe = null;
  // Nobody is reading; drop the map so the next reader starts from the bridge's replay.
  latest = EMPTY;
}

/**
 * Listen for any channel's loaded messages changing. The first listener opens
 * the one shared bridge subscription and the last one closes it.
 */
export function subscribeCachedGroupMessages(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

/** `groupId`'s loaded messages, or `undefined` when there are none (or no group). */
export function getCachedGroupMessages(groupId: string | null | undefined): ReadonlyArray<JsMessage> | undefined {
  return groupId ? latest[groupId] : undefined;
}
