import { describe, expect, it } from 'vitest';
import { nextFeedAction } from './feed-pane';

const GROUP = { kind: 'group' as const, groupId: 'g1' };

describe('nextFeedAction', () => {
  it('splits first so a live room stays on screen', () => {
    // The Chat/Feed tabs this replaces were mutually exclusive: glancing at
    // the feed meant losing sight of the conversation.
    expect(nextFeedAction(GROUP, false, null)).toEqual({ kind: 'split' });
  });

  it('goes full screen on the second press', () => {
    expect(nextFeedAction(GROUP, true, 'g1')).toEqual({ kind: 'full' });
  });

  it('puts the feed away on the third press, back to the room you came from', () => {
    expect(nextFeedAction({ kind: 'feed' }, false, 'g1'))
      .toEqual({ kind: 'close', view: { kind: 'group', groupId: 'g1' } });
  });

  it('closes to an empty pane when there was no room', () => {
    expect(nextFeedAction({ kind: 'feed' }, false, null))
      .toEqual({ kind: 'close', view: { kind: 'empty' } });
  });

  it('skips the split when there is nothing to split against', () => {
    // A half-width feed beside an empty pane is just a narrow feed.
    expect(nextFeedAction({ kind: 'empty' }, false, null)).toEqual({ kind: 'full' });
    expect(nextFeedAction({ kind: 'dm', peer: null }, false, null)).toEqual({ kind: 'full' });
  });

  it('completes the cycle: split → full → back to the room', () => {
    const first = nextFeedAction(GROUP, false, 'g1');
    expect(first).toEqual({ kind: 'split' });
    const second = nextFeedAction(GROUP, true, 'g1');
    expect(second).toEqual({ kind: 'full' });
    const third = nextFeedAction({ kind: 'feed' }, false, 'g1');
    expect(third).toEqual({ kind: 'close', view: GROUP });
  });
});
