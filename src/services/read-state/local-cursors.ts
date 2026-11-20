import { registerRuntimeCache } from '@/services/local-data/runtime-caches';
import { LOCAL_READ_CURSOR_DB } from '@/constants/read-state/sync-options';
import { useNotificationsStore } from '@/store/notifications';
import { getRecord, openStore } from '@/lib/crypto/vault-idb';
import { useReadStateStore, type RemoteReadState } from '@/store/read-state';

const STORE = 'accounts';
const SEEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface LocalReadState extends RemoteReadState {
  mentionCursors?: Record<string, number>;
  seenMentions?: Record<string, number>;
}

function notificationReads(): LocalReadState {
  const { mentionCursorByRelay, mentionsByRelay } = useNotificationsStore.getState();
  const seenMentions: Record<string, number> = {};
  for (const [relay, cards] of Object.entries(mentionsByRelay)) {
    for (const card of cards) {
      if (card.seen) seenMentions[JSON.stringify([relay, card.id])] = card.createdAt;
    }
  }
  return { mentionCursors: mentionCursorByRelay, seenMentions };
}

function mergeCursors(stored: LocalReadState, incoming: LocalReadState): LocalReadState {
  const merge = (previous: Readonly<Record<string, number>> = {}, next: Readonly<Record<string, number>> = {}) => {
    const result = { ...previous };
    for (const [key, value] of Object.entries(next)) {
      result[key] = Math.max(result[key] ?? 0, value);
    }
    return result;
  };
  return {
    mentionCursors: merge(stored.mentionCursors, incoming.mentionCursors),
    seenMentions: Object.fromEntries(Object.entries(merge(stored.seenMentions, incoming.seenMentions))
      .filter(([, at]) => at > Date.now() - SEEN_RETENTION_MS)),
    dmCursors: merge(stored.dmCursors, incoming.dmCursors),
    groupCursors: merge(stored.groupCursors, incoming.groupCursors),
    inboxLastReadAt: Math.max(stored.inboxLastReadAt ?? 0, incoming.inboxLastReadAt ?? 0),
  };
}

function commit(db: IDBDatabase, owner: string, incoming: LocalReadState): Promise<LocalReadState> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get(owner);
    let merged = incoming;
    request.onsuccess = () => {
      merged = mergeCursors(request.result ?? {}, incoming);
      store.put(merged, owner);
    };
    transaction.oncomplete = () => resolve(merged);
    transaction.onabort = () => reject(transaction.error);
  });
}

function applyReadState(value: LocalReadState): void {
  useReadStateStore.getState().applyRemoteState(value);
  const notifications = useNotificationsStore.getState();
  for (const [relay, cursor] of Object.entries(value.mentionCursors ?? {})) {
    notifications.applyRemoteMentionCursor(relay, cursor);
  }
  for (const [relay, cards] of Object.entries(notifications.mentionsByRelay)) {
    for (const card of cards) {
      if (!card.seen && value.seenMentions?.[JSON.stringify([relay, card.id])]) {
        notifications.markMentionSeen(relay, card.id);
      }
    }
  }
}

/** Reconcile the persisted cursors before the authenticated shell can read them. */
export async function hydrateLocalCursors(owner: string, assertCurrent: () => void): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openStore(indexedDB, LOCAL_READ_CURSOR_DB, STORE);
    try {
      const value = await getRecord<LocalReadState>(db, STORE, owner);
      assertCurrent();
      if (value) applyReadState(value);
    } finally {
      db.close();
    }
  } catch {
    // The account's localStorage state remains available when IndexedDB is unavailable.
  }
}

export function startLocalCursorSync(owner: string): () => void {
  if (typeof indexedDB === 'undefined') return () => {};
  const db = openStore(indexedDB, LOCAL_READ_CURSOR_DB, STORE);
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`${LOCAL_READ_CURSOR_DB}:${owner}`);
  let stopped = false;
  let applying = false;
  const isCurrent = () => !stopped && useReadStateStore.persist.getOptions().name === `obelisk-read-state:${owner}`;

  let latest: LocalReadState | undefined;
  const apply = (value: LocalReadState | undefined) => {
    if (!isCurrent() || !value) return;
    applying = true;
    try {
      latest = mergeCursors(latest ?? {}, value);
      applyReadState(latest);
    } finally {
      applying = false;
    }
  };

  const refresh = () => {
    void db.then((connection) => isCurrent() ? getRecord<LocalReadState>(connection, STORE, owner) : undefined)
      .then(apply).catch(() => {});
  };
  const persist = ({ dmCursors, groupCursors, inboxLastReadAt }: RemoteReadState) => {
    if (!isCurrent()) return;
    const snapshot = { dmCursors, groupCursors, inboxLastReadAt, ...notificationReads() };
    void db.then((connection) => commit(connection, owner, snapshot))
      .then((value) => {
        if (!isCurrent() || !value) return;
        apply(value);
        channel?.postMessage('updated');
      }).catch(() => {});
  };

  if (channel) channel.onmessage = refresh;
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  const unsub = useReadStateStore.subscribe((next, previous) => {
    if (applying) return;
    if (next.dmCursors !== previous.dmCursors || next.groupCursors !== previous.groupCursors
      || next.inboxLastReadAt !== previous.inboxLastReadAt) persist(next);
  });
  const unsubNotifications = useNotificationsStore.subscribe((next, previous) => {
    if (applying) return;
    if (next.mentionsByRelay !== previous.mentionsByRelay || next.mentionCursorByRelay !== previous.mentionCursorByRelay) {
      persist(useReadStateStore.getState());
      apply(latest);
    }
  });
  persist(useReadStateStore.getState());

  const dispose = () => {
    if (stopped) return;
    stopped = true;
    unregister();
    unsub();
    unsubNotifications();
    channel?.close();
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
    void db.then((connection) => connection.close()).catch(() => {});
  };
  const unregister = registerRuntimeCache({
    id: LOCAL_READ_CURSOR_DB, category: 'readState', scope: 'account', sensitive: true, invalidate: dispose,
  });
  void db.then((connection) => { connection.onversionchange = dispose; }).catch(() => {});
  return dispose;
}
