/** The fallback tile's hue for a key: its first 24 bits, mod 360. */
export function avatarHue(pubkey: string): number {
  return parseInt(pubkey.slice(0, 6), 16) % 360;
}
