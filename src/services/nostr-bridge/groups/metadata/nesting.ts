/**
 * The channel category tree (kind 39000 `parent` tags): parent id to its
 * child channel ids, the store the sidebar nests by, kept in step with a
 * reverse index so each metadata ingest touches only the buckets it moves
 * between. Pure move from `groups/metadata.ts`.
 */
import { StateStore } from '../../common/state-store';

export class GroupNesting {
  readonly childrenByParent = new StateStore<Record<string, string[]>>({});
  /**
   * Reverse index for {@link childrenByParent}: groupId to its current parent
   * (or `null` if root). Lets {@link move} update the children map in O(1)
   * on every kind 39000 ingest instead of scanning every parent bucket for
   * the groupId: the relay can deliver hundreds of 39000 events
   * back-to-back at login, and the old `Object.keys(prev)` + `.filter()` per
   * ingest was O(parents x children) on a hot path. Lifecycle mirrors
   * {@link childrenByParent}.
   */
  private readonly groupParentMap = new Map<string, string | null>();

  /**
   * `groupId` now sits under `parent` (or at the root). Looks up the
   * previous parent in the reverse map and only touches the affected
   * buckets; a parent that did not change is a no-op.
   */
  move(groupId: string, parent: string | null): void {
    const oldParent = this.groupParentMap.get(groupId) ?? null;
    if (oldParent !== parent) {
      this.childrenByParent.update((prev) => {
        let nextMap = prev;
        if (oldParent && prev[oldParent]) {
          const filtered = prev[oldParent].filter((id) => id !== groupId);
          if (filtered.length !== prev[oldParent].length) {
            if (filtered.length === 0) {
              const { [oldParent]: _drop, ...rest } = nextMap;
              void _drop;
              nextMap = rest;
            } else {
              nextMap = { ...nextMap, [oldParent]: filtered };
            }
          }
        }
        if (parent) {
          const arr = nextMap[parent] ?? [];
          if (!arr.includes(groupId)) {
            nextMap = { ...nextMap, [parent]: [...arr, groupId].sort() };
          }
        }
        return nextMap;
      });
      this.groupParentMap.set(groupId, parent);
    }
  }

  /** The cache seed: record a cached channel's parent without touching the store. */
  setParent(groupId: string, parent: string | null): void {
    this.groupParentMap.set(groupId, parent);
  }

  /** The cache seed: merge the cached buckets into the store in one write. */
  mergeChildren(cachedChildren: Record<string, string[]>): void {
    this.childrenByParent.update((prev) => {
      const next = { ...prev };
      for (const [parent, children] of Object.entries(cachedChildren)) {
        next[parent] = Array.from(new Set([...(prev[parent] ?? []), ...children])).sort();
      }
      return next;
    });
  }

  /** Relay switch: the tree is per relay (the same `d` tag can exist on two relays independently). */
  reset(): void {
    this.childrenByParent.set({});
    this.groupParentMap.clear();
  }
}
