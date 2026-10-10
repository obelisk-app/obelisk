import type { JsMessage } from '../../common/types';

type Index = { ids: Set<string>; pending: JsMessage[]; sorted: boolean };

/** Index only immutable array snapshots. Other writers automatically invalidate it. */
export class OrderedMessageSnapshot {
  private readonly snapshots = new WeakMap<JsMessage[], Index>();

  insert(existing: JsMessage[], msg: JsMessage): { messages: JsMessage[]; replacedClientTag: string | null } {
    let index = this.snapshots.get(existing);
    if (!index) {
      index = {
        ids: new Set(existing.map(m => m.id)),
        pending: existing.filter(m => m.pending === true),
        sorted: existing.every((m, i) => i === 0 || existing[i - 1].createdAt <= m.createdAt),
      };
      this.snapshots.set(existing, index);
    }
    if (index.ids.has(msg.id)) return { messages: existing, replacedClientTag: null };
    const pending = index.pending.find(m => m.pubkey === msg.pubkey && m.content === msg.content && m.createdAt === msg.createdAt);
    const next = [...existing];
    if (pending) {
      // Same timestamp: retain the original stable tie position.
      next[existing.indexOf(pending)] = msg;
    } else if (!index.sorted) {
      next.push(msg);
    } else {
      // Upper bound matches stable sort: new equal timestamps go last.
      let low = 0;
      let high = existing.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (existing[mid].createdAt <= msg.createdAt) low = mid + 1;
        else high = mid;
      }
      next.splice(low, 0, msg);
    }
    if (!index.sorted) {
      next.sort((a, b) => a.createdAt - b.createdAt);
      index.sorted = true;
      index.pending.sort((a, b) => a.createdAt - b.createdAt);
    }
    // Transfer the index, never share a mutable index with an older snapshot.
    // Weak keys let reset/relay switch release the cache without lifecycle work.
    this.snapshots.delete(existing);
    if (pending) {
      index.ids.delete(pending.id);
      index.pending = index.pending.filter(m => m !== pending);
    }
    index.ids.add(msg.id);
    this.snapshots.set(next, index);
    return { messages: next, replacedClientTag: pending?.clientTag ?? null };
  }
}
