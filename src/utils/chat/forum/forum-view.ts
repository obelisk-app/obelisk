import type { JsGroup } from '@/services/nostr-bridge';
import type { ForumViewMode } from '@/services/forum-prefs';

/** The child publications of a forum, in `childIds` order; ids with no known group are skipped. */
export function resolveChildGroups(childIds: ReadonlyArray<string>, groups: ReadonlyArray<JsGroup>): JsGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g] as const));
  return childIds.map((id) => byId.get(id)).filter(Boolean) as JsGroup[];
}

/** The publication whose name equals the trimmed query, ignoring case. */
export function findExactThread(children: ReadonlyArray<JsGroup>, searchQuery: string): JsGroup | undefined {
  const q = searchQuery.trim().toLowerCase();
  return children.find((c) => (c.name ?? '').toLowerCase() === q);
}

/** What Enter in the search bar does: nothing, open the exact match, or start a new one titled with the query. */
export type ForumSearchSubmit =
  | { readonly kind: 'none' }
  | { readonly kind: 'open'; readonly id: string }
  | { readonly kind: 'create'; readonly title: string };

export function forumSearchSubmit(children: ReadonlyArray<JsGroup>, searchQuery: string): ForumSearchSubmit {
  const q = searchQuery.trim();
  if (!q) return { kind: 'none' };
  const match = findExactThread(children, q);
  return match ? { kind: 'open', id: match.id } : { kind: 'create', title: q };
}

/** The list with `id` added, or removed when it is already there. */
export function toggleTagId(selected: ReadonlyArray<string>, id: string): ReadonlyArray<string> {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** Which body the publications list shows. */
export type ForumListState = 'loading' | 'empty' | 'no-match' | 'gallery' | 'list';

/**
 * Loading until the relay finishes its kind 39000 stream and nothing has
 * arrived yet (otherwise the empty CTA would flash while children are still
 * on the wire); then empty, no match, or the cards in the chosen view.
 */
export function forumListState(o: {
  readonly childCount: number;
  readonly visibleCount: number;
  readonly metadataEose: boolean;
  readonly viewMode: ForumViewMode;
}): ForumListState {
  if (o.childCount === 0 && !o.metadataEose) return 'loading';
  if (o.childCount === 0) return 'empty';
  if (o.visibleCount === 0) return 'no-match';
  return o.viewMode === 'gallery' ? 'gallery' : 'list';
}

/** The parent's access flags a new publication inherits, with the open defaults when the parent is unknown. */
export function forumAccessFlags(forum: JsGroup | null | undefined) {
  return {
    isPublic: forum?.isPublic ?? true,
    isHidden: forum?.isHidden ?? false,
    isRestricted: forum?.isRestricted ?? false,
    isOpen: forum?.isOpen ?? true,
  };
}
