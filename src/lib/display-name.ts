/**
 * What to call someone who has no profile.
 *
 * Most pubkeys on a relay have no kind:0, and every surface invented its own
 * answer: the member list printed `pubkey.slice(0, 10)` (raw hex), chat
 * printed `npub1uht…acqx`, the DM list glued `npub1` onto a hex slice to make
 * something that *looked* like bech32 but wasn't, and a handful of rows
 * showed a friendly name — those were accounts that signed up through Obelisk
 * and got a real `name` written into their kind:0 by `randomProfileName`.
 *
 * So the same stranger had a different identity on every screen, and none of
 * them were readable. This module is the one answer.
 *
 * ## Deterministic, not random
 *
 * `petnameFor` hashes the pubkey, so a given key is always the same name —
 * across surfaces, sessions and devices. That is the whole point: a name that
 * changed per render would be worse than hex.
 *
 * ## The collision caveat
 *
 * A word pair is not an identity. The vocabulary below yields a few thousand
 * combinations, so in a large room two strangers will eventually share a
 * petname, and a petname is trivially grindable by anyone who wants to
 * resemble someone else. It is a readability aid and nothing more — never
 * show it where a reader is deciding whether to trust an identity without the
 * npub or a NIP-05 beside it. `UserAvatar` colours still key off the pubkey,
 * not the name, so two petname twins don't look alike.
 */

/** Kept first so `randomProfileName(() => 0)` still yields "Brave Badger". */
export const ADJECTIVES = [
  'Brave', 'Calm', 'Cosmic', 'Electric', 'Lucky', 'Lunar', 'Mighty', 'Neon',
  'Quiet', 'Swift', 'Wild', 'Wise', 'Amber', 'Bold', 'Bright', 'Clever',
  'Copper', 'Crimson', 'Curious', 'Daring', 'Eager', 'Gentle', 'Golden',
  'Hidden', 'Humble', 'Iron', 'Jolly', 'Keen', 'Loyal', 'Merry', 'Noble',
  'Patient', 'Quick', 'Restless', 'Silent', 'Silver', 'Solar', 'Steady',
  'Stellar', 'Sunny', 'Tidal', 'Velvet', 'Vivid', 'Wandering',
];

export const NOUNS = [
  'Badger', 'Condor', 'Falcon', 'Fox', 'Jaguar', 'Llama', 'Otter', 'Puma',
  'Raven', 'Tiger', 'Wolf', 'Zorro', 'Alpaca', 'Beaver', 'Bison', 'Cicada',
  'Crane', 'Dolphin', 'Eagle', 'Egret', 'Ferret', 'Finch', 'Gecko', 'Heron',
  'Ibis', 'Kestrel', 'Lark', 'Lemur', 'Lynx', 'Marten', 'Meerkat', 'Ocelot',
  'Osprey', 'Owl', 'Panda', 'Pelican', 'Quokka', 'Rabbit', 'Seal', 'Sparrow',
  'Stork', 'Tapir', 'Toucan', 'Vicuna',
];

/**
 * FNV-1a. Not cryptographic — it only has to spread word pairs evenly and
 * give the same answer in every tab.
 */
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A stable two-word name for a pubkey. Same key, same name, always. */
export function petnameFor(pubkey: string): string {
  const key = pubkey.trim().toLowerCase();
  const hash = hash32(key);
  // Different slices of the hash for each word, so the pair varies
  // independently rather than marching through the lists together.
  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `${adjective} ${noun}`;
}

/** The profile fields any surface might hold. All optional, all untrusted. */
export type NameLike = {
  displayName?: string | null;
  name?: string | null;
  nip05?: string | null;
} | null | undefined;

/**
 * What to show for `pubkey`.
 *
 * Order: what they call themselves, then their NIP-05 local part, then a
 * petname. A blank or whitespace-only field counts as absent — relays carry
 * plenty of `{"name": ""}`.
 */
export function displayNameFor(pubkey: string, meta?: NameLike): string {
  const display = meta?.displayName?.trim();
  if (display) return display;
  const name = meta?.name?.trim();
  if (name) return name;
  // `alice@example.com` → `alice`; a bare `_@domain` is the domain's own
  // identity and says nothing, so it's skipped.
  const nip05 = meta?.nip05?.trim();
  if (nip05) {
    const local = nip05.split('@')[0]?.trim();
    if (local && local !== '_') return local;
  }
  return petnameFor(pubkey);
}

/**
 * One or two letters for an avatar.
 *
 * The member list derived these from `displayName`, which was a hex slice —
 * so the fallback avatar read `6A`. Falling back to the petname keeps the
 * letters pronounceable even when nothing is known.
 */
export function avatarInitials(name: string | null | undefined, pubkey: string): string {
  const source = name?.trim() || petnameFor(pubkey);
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
