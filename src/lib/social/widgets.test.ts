import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FEED_WIDGETS,
  FEED_WIDGET_MAX,
  normalizeFeedWidgets,
  toggleFeedWidget,
} from './widgets';

describe('feed widgets', () => {
  it('defaults to two panels', () => {
    expect(DEFAULT_FEED_WIDGETS).toEqual(['trending', 'who-to-follow']);
  });

  it('falls back to the defaults for anything unusable', () => {
    for (const value of [undefined, null, 'trending', 42, {}, []]) {
      expect(normalizeFeedWidgets(value)).toEqual([...DEFAULT_FEED_WIDGETS]);
    }
  });

  /** A widget removed from the catalogue must not render as a gap. */
  it('drops ids that no longer exist', () => {
    expect(normalizeFeedWidgets(['trending', 'nope'])).toEqual(['trending']);
  });

  it('drops duplicates', () => {
    expect(normalizeFeedWidgets(['trending', 'trending'])).toEqual(['trending']);
  });

  it('caps the column', () => {
    const all = normalizeFeedWidgets(['trending', 'who-to-follow', 'followed-tags', 'relays']);
    expect(all.length).toBeLessThanOrEqual(FEED_WIDGET_MAX);
  });

  it('adds a widget that was off', () => {
    expect(toggleFeedWidget(['trending'], 'relays')).toEqual(['trending', 'relays']);
  });

  it('removes a widget that was on', () => {
    expect(toggleFeedWidget(['trending', 'relays'], 'relays')).toEqual(['trending']);
  });

  it('keeps catalogue order rather than click order', () => {
    expect(toggleFeedWidget(['relays'], 'trending')).toEqual(['trending', 'relays']);
  });

  /** An empty column reads as a bug, so the last one on stays on. */
  it('refuses to switch off the only remaining widget', () => {
    expect(toggleFeedWidget(['trending'], 'trending')).toEqual(['trending']);
  });
});
