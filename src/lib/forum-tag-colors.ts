/**
 * Colors for publication tags.
 *
 * Structured like `src/lib/wot/colors.ts` — an exported palette list plus a
 * lookup function, kept out of any component so both shells share one source
 * of truth.
 *
 * Why raw color strings and not Tailwind classes: the desktop shell styles
 * with `lc-*` Tailwind utilities while the mobile shell styles with
 * `--app-*` CSS variables in `mobile-shell.css`. Inline `style` is the only
 * representation both can consume — and Tailwind can't generate class names
 * from runtime values anyway.
 *
 * A tag's color is either chosen by the forum admin (persisted as slot 4 of
 * the `forum-tag` metadata tag) or derived from a stable hash of its id, so
 * every tag is colored without anyone having to configure anything.
 */

export interface TagPalette {
  /** Stable key — this is what goes on the wire. */
  readonly key: string;
  /** Human label for the swatch picker. */
  readonly label: string;
  /** Full-strength hue: chip text and the leading dot. */
  readonly text: string;
  /** ~40% alpha: chip border. */
  readonly border: string;
  /** ~12% alpha: chip background. */
  readonly bg: string;
  /** Deeper background for the selected state. */
  readonly bgActive: string;
}

function palette(key: string, label: string, rgb: string): TagPalette {
  return {
    key,
    label,
    text: `rgb(${rgb})`,
    border: `rgba(${rgb}, 0.42)`,
    bg: `rgba(${rgb}, 0.12)`,
    bgActive: `rgba(${rgb}, 0.24)`,
  };
}

/**
 * Curated rather than free-form `hsl(${hash % 360})`: every entry is legible
 * on `lc-black` and sits comfortably next to `lc-green`. Lime is first so
 * the existing accent stays available to admins.
 */
export const TAG_PALETTES: ReadonlyArray<TagPalette> = [
  palette('lime', 'Lime', '180, 249, 83'),
  palette('cyan', 'Cyan', '34, 211, 238'),
  palette('violet', 'Violet', '167, 139, 250'),
  palette('amber', 'Amber', '251, 191, 36'),
  palette('rose', 'Rose', '251, 113, 133'),
  palette('emerald', 'Emerald', '52, 211, 153'),
  palette('sky', 'Sky', '56, 189, 248'),
  palette('orange', 'Orange', '251, 146, 60'),
  palette('fuchsia', 'Fuchsia', '232, 121, 249'),
  palette('slate', 'Slate', '148, 163, 184'),
];

const BY_KEY = new Map(TAG_PALETTES.map((p) => [p.key, p] as const));

/** Whether a string is a palette key we can safely render. */
export function isTagColorKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && BY_KEY.has(value);
}

/**
 * Same `h * 31 + charCode` hash used by `paletteFor` in `PhoneShell` and
 * `colorFor` in `ServerRail`. Stable across reloads and devices, which is
 * what makes an underived tag keep its color everywhere.
 */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Resolve a tag to its palette: the admin's explicit choice when it names a
 * palette we know, otherwise one derived from the tag id.
 *
 * Falling back on an *unknown* key matters — the value arrives from a relay,
 * and an arbitrary string must never reach a style attribute.
 */
export function paletteForTag(tag: { id: string; color?: string | null }): TagPalette {
  if (tag.color) {
    const chosen = BY_KEY.get(tag.color);
    if (chosen) return chosen;
  }
  return TAG_PALETTES[hash(tag.id) % TAG_PALETTES.length];
}

/** Inline style for a tag chip. `active` deepens the tint and border. */
export function tagChipStyle(
  tag: { id: string; color?: string | null },
  active = false,
): { background: string; borderColor: string; color: string } {
  const p = paletteForTag(tag);
  return {
    background: active ? p.bgActive : p.bg,
    borderColor: active ? p.text : p.border,
    color: p.text,
  };
}
