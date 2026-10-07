import { describe, expect, it } from 'vitest';
import { FEED_WIDGETS } from '@/constants/social/widgets';
import { feedWidgetOptions } from '@/utils/social/feed-widget-options';

describe('feedWidgetOptions', () => {
  it('lists every widget in catalogue order with whether it is on', () => {
    const options = feedWidgetOptions(['relays', 'trending']);
    expect(options.map((o) => o.id)).toEqual([...FEED_WIDGETS]);
    expect(options.filter((o) => o.on).map((o) => o.id)).toEqual(['trending', 'relays']);
  });

  it('locks the last widget that is on, and nothing else', () => {
    const options = feedWidgetOptions(['trending']);
    expect(options.find((o) => o.id === 'trending')).toMatchObject({ on: true, locked: true });
    expect(options.filter((o) => o.locked)).toHaveLength(1);
  });

  it('locks nothing while two or more are on', () => {
    expect(feedWidgetOptions(['trending', 'relays']).some((o) => o.locked)).toBe(false);
  });
});
