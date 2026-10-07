import { hexToNpub } from '@nostr-wot/data';

/**
 * `npub1abcd…wxyz`: the only way a key is shown as a label. Raw hex is an
 * internal identifier: it reads as noise, and nothing a user types or
 * shares accepts it.
 */
export function shortNpubLabel(pubkey: string): string {
  try {
    const npub = hexToNpub(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
  } catch {
    return '';
  }
}

/**
 * The full npub for a hex pubkey, or the input itself when it does not
 * encode. This was written three times (the DM menus, the social menus and
 * the public profile viewer); `npubOrNull` below is the variant for a
 * caller that branches on a key that does not encode (the user panel).
 */
export function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}

/** `npub1…` for a hex key, or `null` when it is not one. */
export function npubOrNull(pubkey: string): string | null {
  try {
    return hexToNpub(pubkey);
  } catch {
    return null;
  }
}
