/**
 * Share links for notes and articles.
 *
 * Every Nostr link this app produces stays on Obelisk. Pointing at njump.me
 * handed the recipient to a third party, gave that third party the preview
 * card in whatever chat the link was pasted into, and made an Obelisk link
 * a dead end for getting people into Obelisk.
 *
 * The three shapes, all server-rendered with their own OG metadata:
 *   /notes/<nevent|naddr>  a note or article
 *   /p/<npub>              a profile
 *   /t/<hashtag>           a hashtag feed
 */

import { nip19 } from 'nostr-tools';
import type { Event as NostrEvent } from 'nostr-tools';

export const NOTE_VIEWER_PATH = '/notes';

/**
 * Prefer an `nevent` over a bare id: it carries the author and relay hints,
 * so a viewer that has never seen the note can still find it.
 */
export function noteIdentifier(
  note: Pick<NostrEvent, 'id' | 'pubkey' | 'kind' | 'tags'>,
  relays: readonly string[] = [],
): string {
  try {
    // Addressable kinds (long-form) are identified by coordinate, not id —
    // an `nevent` would pin one revision of an article that gets edited.
    if (note.kind >= 30000 && note.kind < 40000) {
      const identifier = note.tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
      return nip19.naddrEncode({
        identifier,
        pubkey: note.pubkey,
        kind: note.kind,
        ...(relays.length ? { relays: relays.slice(0, 3) } : {}),
      });
    }
    return nip19.neventEncode({
      id: note.id,
      author: note.pubkey,
      kind: note.kind,
      ...(relays.length ? { relays: relays.slice(0, 3) } : {}),
    });
  } catch {
    return note.id;
  }
}

function origin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://obelisk.ar';
}

/** Absolute, shareable Obelisk URL for a note. */
export function noteShareUrl(
  note: Pick<NostrEvent, 'id' | 'pubkey' | 'kind' | 'tags'>,
  relays: readonly string[] = [],
): string {
  return `${origin()}${NOTE_VIEWER_PATH}/${noteIdentifier(note, relays)}`;
}

/** Absolute Obelisk URL for a profile. */
export function profileUrl(pubkey: string, relays: readonly string[] = []): string {
  try {
    const encoded = relays.length
      ? nip19.nprofileEncode({ pubkey, relays: relays.slice(0, 3) as string[] })
      : nip19.npubEncode(pubkey);
    return `${origin()}/p/${encoded}`;
  } catch {
    return `${origin()}/p/${pubkey}`;
  }
}

/** Hashtags are lowercased on the wire, so the URL is too. */
export function hashtagUrl(tag: string): string {
  return `/t/${encodeURIComponent(tag.toLowerCase())}`;
}

/**
 * The NIP-29 group a note belongs to, if any.
 *
 * Group events carry `["h", <groupId>]`. A note that originated in a relay
 * group is only fully meaningful inside that group — the replies and the
 * people are there — so when we can tell, we offer a way back to it rather
 * than stranding the reader on a standalone note.
 */
export function groupIdOf(note: Pick<NostrEvent, 'tags'>): string | null {
  return note.tags.find((tag) => tag[0] === 'h' && tag[1])?.[1] ?? null;
}

/** Host form the app's `?relay=` param expects. */
function relayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  }
}

/**
 * Deep link into the group view for a group-originated note, matching the
 * `?c=&m=&relay=` shape the shell already parses on load.
 */
export function groupNoteUrl(
  note: Pick<NostrEvent, 'id' | 'tags'>,
  relay?: string | null,
): string | null {
  const groupId = groupIdOf(note);
  if (!groupId) return null;
  const url = new URL(`${origin()}/app`);
  url.searchParams.set('c', groupId);
  url.searchParams.set('m', note.id);
  if (relay) url.searchParams.set('relay', relayHost(relay));
  return url.toString();
}

/** Pretty-printed event, for the raw-data view. */
export function rawEventJson(note: NostrEvent): string {
  return JSON.stringify(note, null, 2);
}
