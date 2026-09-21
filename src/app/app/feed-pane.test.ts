import { describe, expect, it } from 'vitest';
import {
  INITIAL_FEED_PANE,
  canRestore,
  canSplitAgainst,
  closeFeed,
  expandFeed,
  openModeFor,
  restoreFeed,
  toggleFeed,
  type FeedHost,
} from './feed-pane';

const GROUP: FeedHost = { kind: 'group', groupId: 'g1' };
const EMPTY: FeedHost = { kind: 'empty' };
const DM: FeedHost = { kind: 'dm', peer: null };

describe('where the feed can sit', () => {
  it('only splits against a room', () => {
    // Beside a DM or an empty pane a half-width feed is just a narrow feed.
    expect(canSplitAgainst(GROUP)).toBe(true);
    expect(canSplitAgainst(EMPTY)).toBe(false);
    expect(canSplitAgainst(DM)).toBe(false);
  });

  it('opens split in a room and full everywhere else', () => {
    expect(openModeFor(GROUP)).toBe('split');
    expect(openModeFor(EMPTY)).toBe('full');
    expect(openModeFor(DM)).toBe('full');
  });

  it('offers restore only when there is something to sit beside', () => {
    // Offering it against an empty pane is how the old cycle stranded you
    // with a half-width feed next to nothing.
    expect(canRestore(GROUP, 'full')).toBe(true);
    expect(canRestore(EMPTY, 'full')).toBe(false);
    // Nothing to restore when already split.
    expect(canRestore(GROUP, 'split')).toBe(false);
  });
});

describe('the rail button', () => {
  it('is a plain toggle, never a third state', () => {
    // The whole point of the rewrite: one press opens, one press closes.
    const opened = toggleFeed(INITIAL_FEED_PANE, GROUP);
    expect(opened).toEqual({ open: true, mode: 'split' });

    const closed = toggleFeed(opened, GROUP);
    expect(closed.open).toBe(false);

    expect(toggleFeed(closed, GROUP).open).toBe(true);
  });

  it('opens full when there is no room to split against', () => {
    expect(toggleFeed(INITIAL_FEED_PANE, EMPTY)).toEqual({ open: true, mode: 'full' });
  });

  it('re-derives the mode on each open rather than remembering a stale one', () => {
    // Expanded in a room, then closed, then reopened from an empty pane:
    // it should not come back split against nothing.
    const full = expandFeed(toggleFeed(INITIAL_FEED_PANE, GROUP));
    const closed = toggleFeed(full, GROUP);
    expect(toggleFeed(closed, EMPTY)).toEqual({ open: true, mode: 'full' });
  });
});

describe('the pane controls', () => {
  it('expands and restores', () => {
    const open = toggleFeed(INITIAL_FEED_PANE, GROUP);
    expect(expandFeed(open).mode).toBe('full');
    expect(restoreFeed(expandFeed(open)).mode).toBe('split');
  });

  it('closes without forgetting the mode it was in', () => {
    const full = expandFeed(toggleFeed(INITIAL_FEED_PANE, GROUP));
    expect(closeFeed(full)).toEqual({ open: false, mode: 'full' });
  });

  it('expanding a closed pane also opens it', () => {
    expect(expandFeed(INITIAL_FEED_PANE)).toEqual({ open: true, mode: 'full' });
  });
});
