import { ADJECTIVES, NOUNS } from '@/constants/identity/display-name';
import { safeNpub, shortNpubLabel } from './short-npub';

/** An editable suggestion for a new account, never a missing-profile fallback. */
export function randomProfileName(random: () => number = Math.random): string {
  return `${ADJECTIVES[Math.floor(random() * ADJECTIVES.length)]} ${NOUNS[Math.floor(random() * NOUNS.length)]}`;
}

/** The profile fields any surface might hold. All optional, all untrusted. */
export type NameLike = {
  displayName?: string | null;
  name?: string | null;
  nip05?: string | null;
} | null | undefined;

/** A chosen profile name, otherwise the shortened public key. */
export function displayNameFor(pubkey: string, meta?: NameLike): string {
  const display = meta?.displayName?.trim();
  if (display) return display;
  const name = meta?.name?.trim();
  if (name) return name;
  return shortNpubLabel(pubkey) || pubkey;
}

/**
 * Profile initials, or, with no profile name, the first characters of the
 * key as people see it: the npub after its `npub1` prefix, the same
 * characters `shortNpubLabel` shows. Never hex digits of the raw key (they
 * matched nothing on screen, and each surface used to cut them differently).
 * Every avatar fallback goes through this one recipe.
 */
export function avatarInitials(name: string | null | undefined, pubkey: string): string {
  const label = name?.trim();
  const source = !label || label === shortNpubLabel(pubkey) ? keyCharacters(pubkey) : label;
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The npub's data part for a hex key; any other id (a group id) as it is. */
function keyCharacters(id: string): string {
  if (!/^[0-9a-f]{64}$/i.test(id)) return id;
  const npub = safeNpub(id.toLowerCase());
  return npub.startsWith('npub1') ? npub.slice(5) : id;
}
