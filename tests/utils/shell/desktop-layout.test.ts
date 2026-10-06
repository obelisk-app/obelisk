import { describe, expect, it } from 'vitest';
import {
  feedHostFor,
  railModeFor,
  readSidebarWidth,
  viewForFeedPane,
} from '@/utils/shell/desktop-layout';

describe('railModeFor', () => {
  it('lights DMs while a DM view is open', () => {
    expect(railModeFor({ kind: 'dm', peer: null }, false, 'wss://r')).toEqual({ kind: 'dm' });
  });

  it('lights the feed when it is full-screen or split beside a group', () => {
    expect(railModeFor({ kind: 'feed' }, false, 'wss://r')).toEqual({ kind: 'feed' });
    expect(railModeFor({ kind: 'group', groupId: 'g' }, true, 'wss://r')).toEqual({ kind: 'feed' });
  });

  it('lights the relay otherwise', () => {
    expect(railModeFor({ kind: 'group', groupId: 'g' }, false, 'wss://r')).toEqual({ kind: 'relay', url: 'wss://r' });
    expect(railModeFor({ kind: 'empty' }, false, 'wss://r')).toEqual({ kind: 'relay', url: 'wss://r' });
  });
});

describe('feedHostFor', () => {
  it('is the room the full-screen feed was opened from', () => {
    expect(feedHostFor({ kind: 'feed' }, 'g1')).toEqual({ kind: 'group', groupId: 'g1' });
    expect(feedHostFor({ kind: 'feed' }, null)).toEqual({ kind: 'empty' });
  });

  it('is the current view when the feed is not the main view', () => {
    const view = { kind: 'group', groupId: 'g2' } as const;
    expect(feedHostFor(view, 'g1')).toBe(view);
  });
});

describe('viewForFeedPane', () => {
  const group = { kind: 'group', groupId: 'g' } as const;

  it('makes the feed the main view when it goes full-screen', () => {
    expect(viewForFeedPane({ open: true, mode: 'full' }, group, group)).toEqual({ kind: 'feed' });
  });

  it('returns from a full-screen feed to the host room when split or closed', () => {
    expect(viewForFeedPane({ open: true, mode: 'split' }, { kind: 'feed' }, group)).toEqual(group);
    expect(viewForFeedPane({ open: false, mode: 'split' }, { kind: 'feed' }, { kind: 'empty' })).toEqual({ kind: 'empty' });
  });

  it('leaves a non-feed view alone when the pane is split or closed', () => {
    expect(viewForFeedPane({ open: true, mode: 'split' }, group, group)).toBeNull();
    expect(viewForFeedPane({ open: false, mode: 'split' }, group, group)).toBeNull();
  });
});

describe('readSidebarWidth', () => {
  it('defaults to 264 when nothing is stored or the value is junk', () => {
    expect(readSidebarWidth(null)).toBe(264);
    expect(readSidebarWidth('wide')).toBe(264);
  });

  it('clamps to the draggable range', () => {
    expect(readSidebarWidth('120')).toBe(200);
    expect(readSidebarWidth('900')).toBe(500);
    expect(readSidebarWidth('320')).toBe(320);
  });
});
