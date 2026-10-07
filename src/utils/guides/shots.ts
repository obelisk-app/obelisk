import type { MessageKey } from '@/i18n/keys';

/**
 * The screenshots of the running app that guides embed with `<Shot>`
 * (`src/components/guides/mdx/Shot.tsx`), for guides that describe the app itself.
 *
 * The heroes and diagrams in `src/assets/illustrations/guides/` are drawings - nice, but a drawing of a
 * game board is a claim, not evidence. These images come out of
 * `npm run snap-games`, which photographs the real components rendering a
 * board they derived from a real event log (see `src/app/dev/game-shots/`).
 * Re-running the script after a rules change updates every guide at once.
 *
 * Sizes are the intrinsic CSS size: the PNGs are captured at 2x, so `width`
 * here is half the pixel width. Setting both keeps the layout from jumping
 * while the image loads.
 *
 * Names are namespaced by where the picture comes from - `games/…` for the
 * snapped components above, `relay/…` for captures of Obelisk Relay's admin
 * console, which is a different program and cannot be photographed from
 * here. The namespace is the directory under `public/og/guides/`.
 */
export interface ShotMeta {
  /** The image's alt text: `guides.shot.alt.*`. */
  altKey: MessageKey;
  width: number;
  height: number;
}

/** Where a shot's PNG is served from: its namespace is its folder under `public/og/guides/`. */
export function shotPath(name: string): string {
  return `/og/guides/${name}.png`;
}
