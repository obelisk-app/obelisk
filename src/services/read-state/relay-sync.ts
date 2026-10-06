/**
 * Encrypted multi-device read-state sync. Two scopes, two transports.
 *
 *   - **Groups state** (per relay): a replaceable `kind:30078` addressed by
 *     `d` tag, NIP-44 encrypted to self. Published to the SINGLE relay whose
 *     groups it tracks. The relay keeps one event per (pubkey, kind, d), so
 *     cursor advances replace rather than accumulate.
 *   - **DM state** (account-global): NIP-59 gift wrap. Published to the union
 *     of read+write relays from the user's NIP-65 (kind 10002) list. DM
 *     cursors plus `inboxLastReadAt` ride together so the bell badge syncs
 *     across devices.
 *
 * Why the split: the wrap conceals that a user runs this app on a given relay.
 * That is worth paying for on third-party NIP-65 relays. It is worth almost
 * nothing on the groups relay, which already authenticates the user over
 * NIP-42 and already publishes their membership as `kind:39002`, while the
 * cost, an unbounded event per cursor advance, is charged in full. See
 * docs/read-state.md.
 *
 * Two traps, both hit in production:
 *
 *   1. A gift wrap must be published through `publishSignedEvent`.
 *      `publishEvent` re-signs its template, which swaps the throwaway wrap
 *      author for the user's own key and leaves the payload undecryptable,
 *      because the reader derives the conversation key from the wrap's pubkey.
 *   2. Gift wraps can never be deleted by their author. `wrapForSelf`
 *      generates the signing key inside the function and discards it, and
 *      NIP-09 requires a deletion be signed by the same pubkey. Nobody can
 *      issue a kind-5 for one. Do not propose it; bound the lifetime with
 *      NIP-40 or use a replaceable event.
 *
 * Both transports debounce by DEBOUNCE_MS and merge newest-wins on read; the
 * store merge is monotonic, so an out-of-order arrival cannot roll a cursor
 * backwards.
 *
 * This file holds the two scopes. The shared constants, payload shapes and
 * parsers live in `sync-options.ts`, the read half in `sync-ingest.ts` and
 * the debounced write half in `sync-publish.ts`.
 */
import { useReadStateStore, type RemoteReadState } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import {
  D_TAG_DMS,
  D_TAG_GROUPS,
  DEBOUNCE_MS,
  SCHEMA_VERSION,
  findInnerDTag,
  parsePayload,
  type DmsPayload,
  type GroupsPayload,
  type SyncOptions,
} from './sync-options';
import { subscribeAndIngest } from './sync-ingest';
import { watchAndPublish } from './sync-publish';

export { D_TAG_DMS, D_TAG_GROUPS, READ_STATE_WATCHDOG_MS } from './sync-options';

/**
 * Start syncing groups-scope state with one relay. Returns a cleanup
 * function that stops the subscription and cancels any pending publish.
 *
 * `groupIdsForRelay` is a snapshot of which group ids belong to this
 * relay; they're the only cursors we'll publish in this scope.
 * Pass an updated snapshot by re-mounting; the engine doesn't re-read it.
 */
export function startGroupsRelaySync(
  relayUrl: string,
  groupIdsForRelay: ReadonlyArray<string>,
): () => void {
  const ids = new Set(groupIdsForRelay);
  const opts: SyncOptions = {
    relays: [relayUrl],
    dTag: D_TAG_GROUPS,
    cacheNamespace: relayUrl,
    ledgerScope: 'readstate:groups',
    transport: 'replaceable',
    // Migration window: clients that published wraps before this release still
    // have their cursors there. Drop once the fleet has turned over.
    alsoReadLegacyWraps: true,
  };

  const apply = (payload: GroupsPayload) => {
    const groupCursors: Record<string, number> = {};
    for (const [gid, entry] of Object.entries(payload.groups)) {
      if (!ids.has(gid)) continue;
      if (typeof entry?.lastReadAt === 'number') {
        groupCursors[gid] = entry.lastReadAt;
      }
    }
    if (Object.keys(groupCursors).length > 0) {
      useReadStateStore.getState().applyRemoteState({ groupCursors });
    }
    // Mention cursor converges across devices under the same max() rule as
    // the group cursors: dismiss the bell on desktop, it's dismissed on
    // the phone. Absent on wraps written by older clients.
    if (typeof payload.mentionsReadAt === 'number') {
      useNotificationsStore
        .getState()
        .applyRemoteMentionCursor(relayUrl, payload.mentionsReadAt);
    }
  };

  const unsubIngest = subscribeAndIngest(opts, apply);

  const fingerprintCursors = (cursors: Record<string, number>): string => {
    const parts: string[] = [];
    for (const gid of ids) {
      const v = cursors[gid];
      if (typeof v === 'number') parts.push(`${gid}:${v}`);
    }
    parts.sort();
    return parts.join('|');
  };

  const mentionCursor = (): number =>
    useNotificationsStore.getState().mentionCursorByRelay[relayUrl] ?? 0;

  const unsubPublish = watchAndPublish(
    opts,
    () =>
      `m:${mentionCursor()}|`
      + fingerprintCursors(useReadStateStore.getState().groupCursors),
    (): GroupsPayload | null => {
      const cursors = useReadStateStore.getState().groupCursors;
      const groups: Record<string, { lastReadAt: number }> = {};
      let any = false;
      for (const gid of ids) {
        const v = cursors[gid];
        if (typeof v === 'number' && v > 0) {
          groups[gid] = { lastReadAt: v };
          any = true;
        }
      }
      const mentionsReadAt = mentionCursor();
      if (!any && mentionsReadAt <= 0) return null;
      return mentionsReadAt > 0 ? { v: 1, groups, mentionsReadAt } : { v: 1, groups };
    },
  );

  return () => {
    unsubIngest();
    unsubPublish();
  };
}

/**
 * Start syncing DM-scope state to the user's NIP-65 relays. Inboxes
 * `inboxLastReadAt` rides along here.
 */
export function startDMRelaySync(relays: ReadonlyArray<string>): () => void {
  if (relays.length === 0) return () => {};
  const opts: SyncOptions = {
    relays,
    dTag: D_TAG_DMS,
    cacheNamespace: 'dm',
    ledgerScope: 'readstate:dms',
    // Stays gift-wrapped: this publishes to the user's NIP-65 third-party
    // relays, where not announcing app usage is worth the accumulation.
    transport: 'giftwrap',
  };

  const apply = (payload: DmsPayload) => {
    const dmCursors: Record<string, number> = {};
    for (const [peer, entry] of Object.entries(payload.dms)) {
      if (typeof entry?.lastReadAt === 'number') {
        dmCursors[peer] = entry.lastReadAt;
      }
    }
    useReadStateStore.getState().applyRemoteState({
      dmCursors,
      inboxLastReadAt: payload.inboxLastReadAt,
    });
  };

  const unsubIngest = subscribeAndIngest(opts, apply);

  const fingerprintDms = (
    cursors: Record<string, number>,
    inboxAt: number,
  ): string => {
    const parts: string[] = [];
    for (const [peer, v] of Object.entries(cursors)) {
      parts.push(`${peer}:${v}`);
    }
    parts.sort();
    return `inbox:${inboxAt}|${parts.join('|')}`;
  };

  const unsubPublish = watchAndPublish(
    opts,
    () => {
      const s = useReadStateStore.getState();
      return fingerprintDms(s.dmCursors, s.inboxLastReadAt);
    },
    (): DmsPayload | null => {
      const s = useReadStateStore.getState();
      const dms: Record<string, { lastReadAt: number }> = {};
      let any = false;
      for (const [peer, v] of Object.entries(s.dmCursors)) {
        if (typeof v === 'number' && v > 0) {
          dms[peer] = { lastReadAt: v };
          any = true;
        }
      }
      if (!any && s.inboxLastReadAt === 0) return null;
      return { v: 1, dms, inboxLastReadAt: s.inboxLastReadAt };
    },
  );

  return () => {
    unsubIngest();
    unsubPublish();
  };
}

/** Internal export for tests. */
export const __INTERNAL = {
  parsePayload,
  findInnerDTag,
  DEBOUNCE_MS,
  SCHEMA_VERSION,
};

// Part of the public surface the store action accepts, referenced from
// docs/read-state.md as the apply shape.
export type { RemoteReadState };
