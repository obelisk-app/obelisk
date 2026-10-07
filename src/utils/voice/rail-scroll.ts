/**
 * The side rail's scroll affordances. On a phone (under `md`) the rail
 * scrolls horizontally, from `md` up vertically; either way an arrow shows
 * while there is more than a few pixels left to scroll that way.
 */

/** The media query under which the rail is a horizontal strip. */
export const RAIL_HORIZONTAL_QUERY = '(max-width: 767px)';

/** Slack, in pixels, before an end counts as reached. */
const EDGE = 4;

type RailBox = Pick<HTMLElement, 'scrollLeft' | 'scrollTop' | 'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight'>;

/** Whether there is more to see before and after the visible part. */
export function railScrollState(el: RailBox, horizontal: boolean): { canPrev: boolean; canNext: boolean } {
  return horizontal
    ? { canPrev: el.scrollLeft > EDGE, canNext: el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE }
    : { canPrev: el.scrollTop > EDGE, canNext: el.scrollTop + el.clientHeight < el.scrollHeight - EDGE };
}

/** One arrow press: 80% of the visible length, backwards for -1. */
export function railScrollBy(el: RailBox, horizontal: boolean, dir: 1 | -1): ScrollToOptions {
  const amount = (horizontal ? el.clientWidth : el.clientHeight) * 0.8 * dir;
  return horizontal ? { left: amount, behavior: 'smooth' } : { top: amount, behavior: 'smooth' };
}
