/**
 * The feed's scroll plumbing: the paging sentinel, the "at the top" report
 * and the pull-to-refresh gesture. Each `watch*` attaches its listeners and
 * returns the function that detaches them, so a hook's effect can return it
 * as its cleanup.
 */

/**
 * Start fetching this far before the sentinel is visible. Waiting for it to
 * actually enter the viewport means the reader watches a spinner they could
 * have skipped.
 */
export const PREFETCH_MARGIN = '600px';
/** How close to the top counts as "still at the top". */
export const AT_TOP_PX = 120;
/**
 * Pulling up when already at the top is the gesture people use to refresh,
 * so honour it instead of making them find a button. Throttled, because the
 * gesture fires continuously and each refresh is a relay round trip.
 */
export const PULL_REFRESH_COOLDOWN_MS = 4000;
/** Enough pull to be deliberate rather than the tail of a scroll. */
export const PULL_THRESHOLD_PX = 60;

/**
 * Call `onReach` whenever `node` comes within `PREFETCH_MARGIN` of the
 * viewport. Nothing happens (and nothing is returned) without a node or
 * without `IntersectionObserver` (jsdom, very old browsers); the host keeps
 * a manual fallback for that.
 */
export function watchSentinel(node: Element | null, onReach: () => void): (() => void) | undefined {
  if (!node || typeof IntersectionObserver === 'undefined') return undefined;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) onReach();
  }, { rootMargin: PREFETCH_MARGIN });
  observer.observe(node);
  return () => observer.disconnect();
}

/**
 * The element the feed scrolls in: the host's explicit scroller, else the
 * nearest ancestor of `from` that scrolls vertically, else the window.
 */
export function findFeedScroller(explicit: HTMLElement | null | undefined, from: HTMLElement | null): HTMLElement | Window | null {
  if (explicit) return explicit;
  let node: HTMLElement | null = from?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return typeof window === 'undefined' ? null : window;
}

/**
 * Report, now and on every scroll, whether the scroller is within
 * `AT_TOP_PX` of the top.
 *
 * Deliberately does NOT refresh. Scrolling back to the top used to fire a
 * full `refresh()`, which replaces the list and re-sorts it. Scrolling up is
 * how you re-read something, so the reliable way to lose the note you were
 * going back for was to go back for it. New notes arrive through the pending
 * pill, which says how many there are and moves nothing until asked.
 */
export function watchAtTop(scroller: HTMLElement | Window, onAtTopChange?: (atTop: boolean) => void): () => void {
  const read = () => {
    const top = scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;
    onAtTopChange?.(top <= AT_TOP_PX);
  };
  read();
  scroller.addEventListener('scroll', read, { passive: true });
  return () => scroller.removeEventListener('scroll', read);
}

/**
 * Pull-to-refresh, for mouse wheels and touch alike: at the top of a feed,
 * pulling further up means "show me what's new". `lastRefresh` holds the
 * time of the last refresh across re-attachments, for the cooldown.
 */
export function watchPullToRefresh(
  scroller: HTMLElement,
  refresh: () => void,
  lastRefresh: { current: number },
): () => void {
  let pulled = 0;

  // `<= 2`, not `=== 0`: iOS rubber-banding and sub-pixel scroll offsets
  // mean a feed the reader sees as "at the top" rarely reports exactly 0,
  // and the strict check made the gesture do nothing on a phone.
  const atVeryTop = () => scroller.scrollTop <= 2;
  const maybeRefresh = () => {
    const now = Date.now();
    if (pulled < PULL_THRESHOLD_PX) return;
    if (now - lastRefresh.current < PULL_REFRESH_COOLDOWN_MS) return;
    lastRefresh.current = now;
    pulled = 0;
    refresh();
  };

  const onWheel = (event: WheelEvent) => {
    if (!atVeryTop() || event.deltaY >= 0) {
      pulled = 0;
      return;
    }
    pulled += -event.deltaY;
    maybeRefresh();
  };

  let touchStart: number | null = null;
  const onTouchStart = (event: TouchEvent) => {
    touchStart = atVeryTop() ? (event.touches[0]?.clientY ?? null) : null;
    pulled = 0;
  };
  const onTouchMove = (event: TouchEvent) => {
    // Only the *start* has to be at the top. Re-checking here meant that
    // the moment the browser rubber-banded (scrollTop going negative or
    // the content shifting under the finger) the pull was abandoned
    // halfway, which is why the gesture never fired on a phone.
    if (touchStart === null) return;
    pulled = (event.touches[0]?.clientY ?? touchStart) - touchStart;
    maybeRefresh();
  };

  scroller.addEventListener('wheel', onWheel, { passive: true });
  scroller.addEventListener('touchstart', onTouchStart, { passive: true });
  scroller.addEventListener('touchmove', onTouchMove, { passive: true });
  return () => {
    scroller.removeEventListener('wheel', onWheel);
    scroller.removeEventListener('touchstart', onTouchStart);
    scroller.removeEventListener('touchmove', onTouchMove);
  };
}
