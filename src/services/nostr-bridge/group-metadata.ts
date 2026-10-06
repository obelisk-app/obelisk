/**
 * Pure parsing and equality for the relay-derived records the bridge
 * caches: NIP-29 kind 39000 tags into a group shape, and the structural
 * equality checks that let an ingest skip a redundant `cacheSet`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { isTagColorKey } from '@/utils/forum-tag-colors';
import type { JsForumTag, JsGroup, JsUserMetadata } from './types';

/**
 * Single-pass parser for NIP-29 kind 39000 (group metadata) tag arrays.
 * Replaces ~9 separate `ev.tags.find / .some / for-of` scans with one loop.
 *
 * NIP-29 access defaults are public and open when negative tags are absent;
 * legacy affirmative `public` and `open` tags remain accepted. `hidden` controls
 * metadata discovery independently, and `restricted` controls write access.
 *
 *  - `d`, `parent`, `name`, `about`, `picture`, `banner`: first occurrence wins.
 *  - `t`: channel-kind hint with `voice-sfu > voice > forum > text` precedence.
 *  - `forum-tag`: id-keyed map, last entry wins; malformed entries (missing
 *    id or name) are skipped silently.
 *  - `topic`: deduped via Set, document order preserved.
 *
 * Hot path: runs on every kind 39000 event in the fan-out at login, and
 * the relay can deliver hundreds of these back-to-back.
 */
export function parseGroupMetadataTags(tags: NostrEvent['tags']): {
  d?: string;
  parent?: string;
  name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  isPublic: boolean;
  isHidden: boolean;
  isRestricted: boolean;
  isOpen: boolean;
  channelKind: 'voice-sfu' | 'voice' | 'forum' | 'text';
  forumTags: JsForumTag[];
  topics: string[];
} {
  let d: string | undefined;
  let parent: string | undefined;
  let name: string | undefined;
  let about: string | undefined;
  let picture: string | undefined;
  let banner: string | undefined;
  let isPublic = true;
  let isHidden = false;
  let isRestricted = false;
  let isOpen = true;
  let hasVoiceSfu = false;
  let hasVoice = false;
  let hasForum = false;
  const forumTagMap = new Map<string, JsForumTag>();
  const topicSet = new Set<string>();

  for (const t of tags) {
    const k = t[0];
    if (k === 'd') { if (d === undefined) d = t[1]; continue; }
    if (k === 'name') { if (name === undefined) name = t[1]; continue; }
    if (k === 'parent') { if (parent === undefined) parent = t[1]; continue; }
    if (k === 'about') { if (about === undefined) about = t[1]; continue; }
    if (k === 'picture') { if (picture === undefined) picture = t[1]; continue; }
    if (k === 'banner') { if (banner === undefined) banner = t[1]; continue; }
    if (k === 'public') { isPublic = true; continue; }
    if (k === 'private') { isPublic = false; continue; }
    if (k === 'hidden') { isHidden = true; continue; }
    if (k === 'restricted') { isRestricted = true; continue; }
    if (k === 'open') { isOpen = true; continue; }
    if (k === 'closed') { isOpen = false; continue; }
    if (k === 't') {
      const v = t[1];
      if (v === 'voice-sfu') hasVoiceSfu = true;
      else if (v === 'voice') hasVoice = true;
      else if (v === 'forum') hasForum = true;
      continue;
    }
    if (k === 'forum-tag') {
      const id = t[1];
      const ftName = t[2];
      if (!id || !ftName) continue;
      const emoji = t[3] && t[3].length > 0 ? t[3] : null;
      // Slot 4 is the optional palette key. Validate it here rather than at
      // render time: an arbitrary relay-supplied string must never reach a
      // style attribute. Unknown value → null → color derived from the id.
      const color = isTagColorKey(t[4]) ? t[4] : null;
      forumTagMap.set(id, { id, name: ftName, emoji, color });
      continue;
    }
    if (k === 'topic') {
      if (t[1]) topicSet.add(t[1]);
      continue;
    }
  }

  const channelKind: 'voice-sfu' | 'voice' | 'forum' | 'text' =
    hasVoiceSfu ? 'voice-sfu' : hasVoice ? 'voice' : hasForum ? 'forum' : 'text';

  return {
    d, parent, name, about, picture, banner,
    isPublic, isHidden, isRestricted, isOpen, channelKind,
    forumTags: Array.from(forumTagMap.values()),
    topics: Array.from(topicSet),
  };
}

/**
 * Strict equality on string arrays. Used to skip redundant cacheSet writes
 * when an admin/member list republished by the relay matches the
 * already-cached snapshot.
 */
export function arraysEqualStrict(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Deep equality on `JsGroup`. Two groups are equal iff every scalar field
 * matches and the `forumTags` / `topics` arrays match positionally. Used to
 * skip redundant cacheSet writes when a kind 39000 republish carries the
 * same payload.
 */
export function groupEqual(a: JsGroup, b: JsGroup): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.name !== b.name || a.about !== b.about
      || a.picture !== b.picture || a.banner !== b.banner
      || a.isPublic !== b.isPublic || a.isHidden !== b.isHidden
      || a.isRestricted !== b.isRestricted || a.isOpen !== b.isOpen
      || a.parent !== b.parent || a.kind !== b.kind) return false;
  if (a.forumTags.length !== b.forumTags.length) return false;
  for (let i = 0; i < a.forumTags.length; i++) {
    const x = a.forumTags[i];
    const y = b.forumTags[i];
    if (!x || !y) return false;
    if (x.id !== y.id || x.name !== y.name || x.emoji !== y.emoji || x.color !== y.color) return false;
  }
  if (a.topics.length !== b.topics.length) return false;
  for (let i = 0; i < a.topics.length; i++) {
    if (a.topics[i] !== b.topics[i]) return false;
  }
  return true;
}

/**
 * Shallow equality on `JsUserMetadata`. All fields are flat scalars. Used
 * to skip redundant cacheSet writes when a kind 0 republish carries the
 * same fields under a newer `created_at`.
 */
export function userMetadataEqual(a: JsUserMetadata, b: JsUserMetadata): boolean {
  if (a === b) return true;
  return a.pubkey === b.pubkey
    && a.name === b.name
    && a.displayName === b.displayName
    && a.picture === b.picture
    && a.about === b.about
    && a.nip05 === b.nip05
    && a.banner === b.banner
    && a.lud16 === b.lud16
    && a.website === b.website;
}
