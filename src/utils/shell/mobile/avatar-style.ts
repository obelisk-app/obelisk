import type { CSSProperties } from 'react';

/**
 * The phone shell's letter-avatar colours: a gradient picked from a seed (a
 * pubkey, a relay URL, a group id), so the same seed always gets the same
 * tile.
 */
const PALETTES = [
  { from: '#4a78a8', to: '#7ec8ff', text: '#fff' },
  { from: '#a85a78', to: '#ff9ec5', text: '#fff' },
  { from: '#7a5aa8', to: '#c9a8ff', text: '#fff' },
  { from: '#6b8a2e', to: '#b4f953', text: '#0a0a0a' },
  { from: '#3a7050', to: '#8bc34a', text: '#0a0a0a' },
  { from: '#a87b3a', to: '#f0c14a', text: '#0a0a0a' },
];

/** The palette a seed lands on: a 31-multiplier string hash, modulo the palette count. */
export function paletteFor(seed: string): { from: string; to: string; text: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/** Background gradient and text colour for a letter avatar. */
export function avatarStyle(seed: string): CSSProperties {
  const p = paletteFor(seed);
  return { background: `linear-gradient(135deg, ${p.from}, ${p.to})`, color: p.text };
}

/** A sized letter avatar: the seed's colours, a font that scales with it (never under 10px). */
export function nameAvatarStyle(seed: string, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.floor(size * 0.36)),
    ...avatarStyle(seed),
  };
}
