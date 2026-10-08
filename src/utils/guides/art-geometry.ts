/**
 * Geometry shared by the guide drawings (`src/assets/illustrations/guides/`): a
 * point on a circle, a hexagon's corners, and the field of drifting packets
 * three heroes scatter over their background. Pure numbers, so a drawing's
 * markup only places what these return (docs/ui/conventions.md#component-files).
 *
 * Every formula is the one the drawings used inline, in the same order of
 * operations, so the committed still frames under `public/og/guides/` stay
 * byte for byte the same.
 */

export interface Point {
  x: number;
  y: number;
}

/** The point `r` away from (`cx`, `cy`) at `deg` degrees (0 is east, clockwise in SVG). */
export function polarPoint(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Corner `i` (0 to 5) of a pointy-top hexagon of radius `r` centred on (`cx`, `cy`). */
export function hexCorner(cx: number, cy: number, r: number, i: number): [number, number] {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

/** A pointy-top hexagon's `points` attribute, one decimal per coordinate. */
export function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

/** The centre of the hex at axial (`q`, `r`), for hexes of radius `size` around (`cx`, `cy`). */
export function axialCenter(q: number, r: number, size: number, cx: number, cy: number): [number, number] {
  return [cx + size * 1.5 * q, cy + size * Math.sqrt(3) * (r + q / 2)];
}

/** One drifting packet: where it sits and its CSS animation timing. */
export interface Particle {
  i: number;
  x: number;
  y: number;
  /** `animation-delay`, two decimals and `s`. */
  delay: string;
  /** `animation-duration`, one decimal and `s`. */
  dur: string;
}

/** `base + (i * step) % mod`: spreads `count` items over a band without looking random. */
export interface Spread {
  base: number;
  step: number;
  mod: number;
}

export interface ParticleField {
  x: Spread;
  y: Spread;
  /** Seconds between one packet's start and the next's. */
  delayStep: number;
  /** The shortest duration, in seconds; the rest cycle up by one through `durCycle` values. */
  durBase: number;
  durCycle: number;
}

/** `count` packets laid out by `field`, the same every render. */
export function particleField(count: number, field: ParticleField): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    i,
    x: field.x.base + (i * field.x.step) % field.x.mod,
    y: field.y.base + ((i * field.y.step) % field.y.mod),
    delay: `${(i * field.delayStep).toFixed(2)}s`,
    dur: `${(field.durBase + (i % field.durCycle)).toFixed(1)}s`,
  }));
}

/** Each item with its index and a `y` that steps down from `base` by `step`: legend rows, menu rows. */
export function stackRows<T extends object>(items: readonly T[], base: number, step: number): Array<T & { i: number; y: number }> {
  return items.map((item, i) => ({ ...item, i, y: base + i * step }));
}

/** `i * step` seconds, two decimals: the stagger most drawings give their pulses. */
export function staggerDelay(i: number, step: number): string {
  return `${(i * step).toFixed(2)}s`;
}
