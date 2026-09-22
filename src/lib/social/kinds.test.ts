import { describe, expect, it } from 'vitest';
import {
  FEED_KINDS,
  KIND_FILE_METADATA,
  KIND_GROUP_CHAT,
  kindsForFilter,
  renderModeFor,
} from './kinds';

describe('renderModeFor', () => {
  it('renders a NIP-29 chat message rather than calling it unsupported', () => {
    // "This client can't display kind 9" is a silly thing for *this* client
    // to say about its own chat messages.
    expect(renderModeFor(KIND_GROUP_CHAT)).toBe('group');
  });

  it('renders NIP-94 file metadata, whose media lives in tags', () => {
    expect(renderModeFor(KIND_FILE_METADATA)).toBe('file');
  });

  it('still falls back for a kind nothing models', () => {
    expect(renderModeFor(31923)).toBe('unsupported');
  });

  it('maps the kinds the feed actually carries', () => {
    expect(renderModeFor(1)).toBe('note');
    expect(renderModeFor(6)).toBe('repost');
    expect(renderModeFor(16)).toBe('repost');
    expect(renderModeFor(20)).toBe('picture');
    expect(renderModeFor(9802)).toBe('highlight');
    expect(renderModeFor(30023)).toBe('article');
    expect(renderModeFor(1111)).toBe('comment');
  });
});

describe('kindsForFilter', () => {
  it('keeps group chat out of the feed', () => {
    // A group's messages belong to that group. The viewer can open one by
    // link; the open feed must not request them.
    expect(FEED_KINDS).not.toContain(KIND_GROUP_CHAT);
    for (const filter of ['all', 'notes', 'articles', 'media'] as const) {
      expect(kindsForFilter(filter)).not.toContain(KIND_GROUP_CHAT);
    }
  });

  it('narrows the REQ per filter rather than filtering after the fact', () => {
    expect(kindsForFilter('articles')).toEqual([30023, 9802]);
    expect(kindsForFilter('media')).toEqual([20, 21, 22]);
    expect(kindsForFilter('all')).toEqual(FEED_KINDS);
  });
});
