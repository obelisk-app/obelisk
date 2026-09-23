/**
 * The desktop feed's side column, as a catalogue rather than one fixed panel.
 *
 * The column held exactly one thing — trending tags — which is a waste of a
 * 288px column on a wide screen and, worse, is not the panel everyone wants.
 * A reader building a follow list wants people; a reader who follows
 * hashtags wants those; someone debugging an empty feed wants relays. So the
 * column takes a list of widget ids from preferences and the reader picks.
 *
 * Every widget here derives from data the feed already holds, or from state
 * the app already subscribes to. None of them opens a new relay query: a
 * sidebar is not worth a socket, and a panel that makes the feed slower to
 * load has negative value however interesting it is.
 */

export const FEED_WIDGETS = [
  'trending',
  'who-to-follow',
  'followed-tags',
  'relays',
] as const;

export type FeedWidgetId = (typeof FEED_WIDGETS)[number];

/**
 * Two, because that is roughly what fits above the fold at 900px tall, and a
 * reader who never opens the picker should still see a full column rather
 * than a scroll. Tags and people: what the feed is about, and who is in it.
 */
export const DEFAULT_FEED_WIDGETS: readonly FeedWidgetId[] = ['trending', 'who-to-follow'];

/** How many can be shown at once — past this the column stops being a sidebar. */
export const FEED_WIDGET_MAX = 4;

function isWidgetId(value: unknown): value is FeedWidgetId {
  return typeof value === 'string' && (FEED_WIDGETS as readonly string[]).includes(value);
}

/**
 * Coerce whatever is in storage into a usable list.
 *
 * A stored id that no longer exists is dropped rather than rendered as a
 * gap, and an empty result falls back to the defaults — a reader who
 * deselected everything is almost certainly mid-thought, and an empty column
 * looks like a bug.
 */
export function normalizeFeedWidgets(value: unknown): FeedWidgetId[] {
  if (!Array.isArray(value)) return [...DEFAULT_FEED_WIDGETS];
  const seen = new Set<FeedWidgetId>();
  for (const entry of value) {
    if (isWidgetId(entry)) seen.add(entry);
    if (seen.size >= FEED_WIDGET_MAX) break;
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_FEED_WIDGETS];
}

/** `widgets` with `id` added or removed, preserving catalogue order. */
export function toggleFeedWidget(
  widgets: readonly string[],
  id: FeedWidgetId,
): FeedWidgetId[] {
  const current = normalizeFeedWidgets(widgets);
  const next = current.includes(id)
    ? current.filter((entry) => entry !== id)
    : [...current, id];
  // Never return empty: the last widget can't be switched off, because a
  // column with nothing in it reads as broken rather than as a choice.
  if (next.length === 0) return current;
  return FEED_WIDGETS.filter((entry) => next.includes(entry)).slice(0, FEED_WIDGET_MAX);
}
