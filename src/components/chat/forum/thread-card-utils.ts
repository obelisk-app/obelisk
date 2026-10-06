import type { Locale } from '@/i18n';
import type { JsForumTag } from '@/services/nostr-bridge';
import { relativeTime } from '@/utils/format/relative-time';

/**
 * Resolve a thread's topic ids against the forum container's curated tag
 * definitions. Unknown ids (the forum admin deleted a tag that's still
 * stamped on an old thread) are silently dropped: the thread keeps showing
 * but loses that chip.
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

/**
 * Compact age of a unix timestamp: "just now", `5m`, `3h`, `2d`, then a short
 * date. The thresholds are `utils/format/relative-time`'s, shared with the DM list and
 * the inbox; this used to be a third copy that counted seconds and never
 * fell back to a date.
 */
export function formatTimeAgo(unixSeconds: number, t: (key: string) => string, locale: Locale): string {
  return relativeTime(unixSeconds, t, locale);
}

/** A poster's name: display name, then name, then the first 8 hex chars. */
export function posterName(meta: { displayName?: string | null; name?: string | null } | null | undefined, pubkey: string): string {
  return meta?.displayName || meta?.name || `${pubkey.slice(0, 8)}…`;
}
