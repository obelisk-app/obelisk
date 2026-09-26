import { hexToNpub } from '@nostr-wot/data';

/**
 * `npub1abcd…wxyz` — the only way a key is shown as a label. Raw hex is an
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
