import type { JsForumTag, JsGroup } from '@/services/nostr-bridge';
import type { ForumPrefs } from '@/services/chat/forum/forum-prefs';

type MessagesByGroup = Readonly<Record<string, ReadonlyArray<{ readonly createdAt: number }>>>;

/** True when the query is empty or names an existing thread exactly (case-insensitive). */
export function hasExactThreadMatch(children: ReadonlyArray<JsGroup>, searchQuery: string): boolean {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  return children.some((t) => (t.name ?? '').toLowerCase() === q);
}

/**
 * The threads to list: name contains the query, tags match (any or all, per
 * the prefs), newest first by last activity or by creation.
 */
export function visibleForumThreads(
  children: ReadonlyArray<JsGroup>,
  searchQuery: string,
  selectedTagIds: ReadonlyArray<string>,
  prefs: Pick<ForumPrefs, 'sortBy' | 'tagMatch'>,
  messagesByGroup: MessagesByGroup,
): JsGroup[] {
  const q = searchQuery.trim().toLowerCase();
  const filtered = children.filter((t) => {
    if (q && !(t.name ?? '').toLowerCase().includes(q)) return false;
    if (selectedTagIds.length > 0) {
      const set = new Set(t.topics);
      if (prefs.tagMatch === 'all') {
        for (const id of selectedTagIds) if (!set.has(id)) return false;
      } else {
        if (!selectedTagIds.some((id) => set.has(id))) return false;
      }
    }
    return true;
  });
  filtered.sort((a, b) => {
    const aMsgs = messagesByGroup[a.id] ?? [];
    const bMsgs = messagesByGroup[b.id] ?? [];
    const aT = prefs.sortBy === 'recent'
      ? aMsgs[aMsgs.length - 1]?.createdAt ?? 0
      : aMsgs[0]?.createdAt ?? 0;
    const bT = prefs.sortBy === 'recent'
      ? bMsgs[bMsgs.length - 1]?.createdAt ?? 0
      : bMsgs[0]?.createdAt ?? 0;
    return bT - aT;
  });
  return filtered;
}

/**
 * Resolve a thread's topic ids against the forum container's curated tag
 * definitions. Unknown ids (the forum admin deleted a tag that's still
 * stamped on an old thread) are silently dropped: the thread keeps showing
 * but loses that chip. Repeated ids count once.
 *
 * The desktop thread cards and the mobile forum card each had a copy of
 * this, byte for byte (`resolveTopics`, `resolveMobileTopics`).
 */
export function resolveTopics(
  topics: ReadonlyArray<string>,
  forumTags: ReadonlyArray<JsForumTag>,
): JsForumTag[] {
  if (topics.length === 0 || forumTags.length === 0) return [];
  const byId = new Map(forumTags.map((t) => [t.id, t] as const));
  const seen = new Set<string>();
  const out: JsForumTag[] = [];
  for (const id of topics) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ft = byId.get(id);
    if (ft) out.push(ft);
  }
  return out;
}

/** A poster's name: display name, then name, then the first 8 hex chars. */
export function posterName(meta: { displayName?: string | null; name?: string | null } | null | undefined, pubkey: string): string {
  return meta?.displayName || meta?.name || `${pubkey.slice(0, 8)}…`;
}
