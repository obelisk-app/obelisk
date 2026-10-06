
const MOBILE_SWIPE_IGNORE_SELECTOR = [
  // Chrome controls own tap/scroll gestures. If a shaky tap on Search also
  // seeds the carousel, the delayed swipe commit can overwrite the click nav.
  '.spaces-strip',
  '.spaces-rail',
  '.dms-tabs',
  '.filter-tabs',
  '.cats-strip',
  '.search-filter-chips',
  '.forum-filter-row',
  '.emoji-sheet-host',
  '.sheet-host',
  '.bottom-nav',
  '.server-banner-actions',
  '.app-header .icon-btn',
  '.chat-actions .icon-btn',
  // Back was missing from this list while the icon buttons beside it were
  // on it. A thumb tap on Back drifts a few pixels, crosses the 8px
  // horizontal threshold in onTouchMove, and becomes a carousel drag - so
  // Back did nothing, or navigated somewhere else entirely.
  '.back-btn',
  '.search-header',
  // Mention autocomplete floats above the composer. A thumb tap on a row
  // drifts a few px, which crosses the 8px horizontal threshold in
  // onTouchMove - the carousel would start dragging and the user would
  // land on a neighbouring screen instead of inserting the mention.
  '.composer-mention-popup',
  '[data-no-swipe]',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
].join(', ');

export function shouldIgnoreMobileSwipeTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return !!target.closest(MOBILE_SWIPE_IGNORE_SELECTOR);
}

// ───────────────────────────────────────────────────────────────────────────
// shared sub-components
