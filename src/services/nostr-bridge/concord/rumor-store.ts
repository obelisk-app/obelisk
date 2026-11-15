import { AsyncRumorStore, EventMemory } from 'applesauce-core';
import { verifyRumor } from 'applesauce-core/helpers';
import type { Rumor } from '@applesauce/concord';
import type { ConcordStorage } from '@applesauce/concord/client';
import type { Filter } from 'nostr-tools';
import { CONCORD_PLANE_EVENT_LIMIT, CONCORD_PLANE_BYTE_LIMIT } from '@/constants/nostr-bridge/concord';

/** Encrypted plane snapshots. Control history is never truncated into an incomplete fold. */
export function concordRumorStore(storage: ConcordStorage, communityId: string, plane: string) {
  const memory = new EventMemory<Rumor>();
  const key = JSON.stringify(['rumors', communityId, plane]);
  let pending = storage.getItem(key).then(value => {
    if (!value) return;
    const rows: unknown = JSON.parse(value);
    if (!Array.isArray(rows) || rows.length > CONCORD_PLANE_EVENT_LIMIT || new TextEncoder().encode(value).length > CONCORD_PLANE_BYTE_LIMIT) throw new Error('Invalid Concord history');
    for (const row of rows) {
      if (!verifyRumor(row)) throw new Error('Invalid cached rumor');
      memory.add(row);
    }
  });
  const read = async <T>(operation: () => T): Promise<T> => { await pending; return operation(); };
  const write = <T>(operation: () => T): Promise<T> => {
    const result = pending.then(async () => {
      const value = operation();
      const snapshot = JSON.stringify(memory.getByFilters({}));
      if (new TextEncoder().encode(snapshot).length > CONCORD_PLANE_BYTE_LIMIT) throw new Error('Concord history capacity exceeded');
      await storage.setItem(key, snapshot);
      return value;
    });
    pending = result.then(() => {});
    return result;
  };
  return new AsyncRumorStore({
    keepOldVersions: true,
    database: {
      hasEvent: id => read(() => memory.hasEvent(id)),
      getEvent: id => read(() => memory.getEvent(id)),
      hasReplaceable: (kind, author, id) => read(() => memory.hasReplaceable(kind, author, id)),
      getReplaceable: (kind, author, id) => read(() => memory.getReplaceable(kind, author, id)),
      getReplaceableHistory: (kind, author, id) => read(() => memory.getReplaceableHistory(kind, author, id)),
      getByFilters: filters => read(() => memory.getByFilters(filters)),
      getTimeline: filters => read(() => memory.getTimeline(filters)),
      add: event => write(() => {
        if (!memory.hasEvent(event.id) && memory.size >= CONCORD_PLANE_EVENT_LIMIT) throw new Error('Concord history capacity exceeded');
        return memory.add(event);
      }),
      remove: event => write(() => memory.remove(event)),
      removeByFilters: (filters: Filter | Filter[]) => write(() => {
        const rows = memory.getByFilters(filters);
        for (const row of rows) memory.remove(row);
        return rows.length;
      }),
    },
  });
}
