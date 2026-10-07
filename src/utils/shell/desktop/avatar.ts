/** The fallback tile's hue for a key: its first 24 bits, mod 360. */
export function avatarHue(pubkey: string): number {
  return parseInt(pubkey.slice(0, 6), 16) % 360;
}

/** The fallback tile's two letters: the key's first two characters, upper-cased. */
export function avatarInitials(pubkey: string): string {
  return pubkey.slice(0, 2).toUpperCase();
}
