import type { JsForumTag, JsGroup } from '@/services/nostr-bridge';
import type { ForumPrefs } from '@/services/forum-prefs';

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

/** A thread's topic ids resolved to the forum's tags, unknown and repeated ids dropped. */
export function resolveMobileTopics(
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
