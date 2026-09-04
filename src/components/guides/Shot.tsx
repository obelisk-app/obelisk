/**
 * A screenshot of the running app, for guides that describe the app itself.
 *
 * The heroes and diagrams next door are drawings — nice, but a drawing of a
 * game board is a claim, not evidence. These images come out of
 * `npm run snap-games`, which photographs the real components rendering a
 * board they derived from a real event log (see `src/app/dev/game-shots/`).
 * Re-running the script after a rules change updates every guide at once.
 *
 * Sizes are the intrinsic CSS size: the PNGs are captured at 2x, so `width`
 * here is half the pixel width. Setting both keeps the layout from jumping
 * while the image loads.
 */
export interface ShotMeta {
  alt: string;
  width: number;
  height: number;
}

export const SHOT_META: Record<string, ShotMeta> = {
  'chain-reaction-board': {
    width: 420,
    height: 484,
    alt: 'Chain Reaction board in Obelisk: a 6×9 grid of dark cells holding glowing red, lime and cyan orbs, with a legend naming the three players and whose turn it is.',
  },
  'chain-reaction-result': {
    width: 380,
    height: 181,
    alt: 'Chain Reaction final standings in Obelisk: first place with a trophy and an orb count, second place marked out, under the heading "Final result".',
  },
  'vesta-board': {
    width: 860,
    height: 870,
    alt: 'Vesta board in Obelisk: a hexagonal island of resource tiles with numbered dice tokens, player settlements and roads on the edges, a robber on the desert, and each player’s hand and victory points below.',
  },
  'stacker-well': {
    width: 340,
    height: 475,
    alt: 'A Stacker playfield in Obelisk: a ten-column well part-filled with coloured tetromino blocks and the ghost outline of the falling piece near the top.',
  },
  'stacker-table': {
    width: 760,
    height: 874,
    alt: 'A live three-player Stacker match in Obelisk: the player’s own well with grey garbage lines at the bottom, hold and next-piece rails, and two opponents shown as miniature boards with their attack and line counts.',
  },
  'game-picker': {
    width: 448,
    height: 444,
    alt: 'The Obelisk "Pick a game" dialog listing Chain Reaction, Vesta and Stacker, each with a thumbnail, a one-line description, its player range and its turn clock.',
  },
};

export function shotPath(name: string): string {
  return `/og/guides/games/${name}.png`;
}

export default function Shot({
  name,
  caption,
  /** Cap the rendered width; the natural size is often wider than the column. */
  maxWidth,
}: {
  name: string;
  caption?: string;
  maxWidth?: number;
}) {
  const meta = SHOT_META[name];
  if (!meta) return null;
  return (
    <figure className="my-8 w-full" data-testid={`shot-${name}`}>
      <div className="w-full overflow-hidden rounded-xl border border-lc-border bg-lc-dark">
        {/* Plain <img>: these are already the exact pixels we want, and
            next/image would re-encode a screenshot of a dark UI badly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shotPath(name)}
          alt={meta.alt}
          width={meta.width}
          height={meta.height}
          className="mx-auto block h-auto w-full"
          style={maxWidth ? { maxWidth } : undefined}
          loading="lazy"
          decoding="async"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-lc-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
