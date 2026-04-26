import { describe, it, expect } from 'vitest';
import { shouldSuppress, type SuppressionContext, type NotificationPayload } from './suppression';

const VIEWER = 'npub_me';

const baseCtx: SuppressionContext = {
  viewerPubkey: VIEWER,
  documentVisible: false,
  windowFocused: false,
  activeChannelId: null,
  activePostId: null,
  scrolledToBottom: false,
  resolvedPref: { notifyLevel: 'mentions', mutedUntil: null },
};

const basePayload: NotificationPayload = {
  recipientPubkey: VIEWER,
  type: 'mention',
  channelId: 'ch1',
  serverId: 's1',
  senderPubkey: 'npub_alice',
  preview: 'hi',
  createdAt: new Date().toISOString(),
  scopeChain: [{ type: 'channel', id: 'ch1' }, { type: 'server', id: 's1' }],
};

describe('shouldSuppress', () => {
  it('does NOT suppress a mention from a stranger when tab is hidden', () => {
    expect(shouldSuppress(basePayload, baseCtx)).toBe(false);
  });

  it('suppresses when actively reading the same channel', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      documentVisible: true,
      windowFocused: true,
      activeChannelId: 'ch1',
      scrolledToBottom: true,
    })).toBe(true);
  });

  it('does NOT suppress when in the channel but window is unfocused', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      documentVisible: true,
      windowFocused: false,
      activeChannelId: 'ch1',
      scrolledToBottom: true,
    })).toBe(false);
  });

  it('does NOT suppress when in the channel but scrolled up', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      documentVisible: true,
      windowFocused: true,
      activeChannelId: 'ch1',
      scrolledToBottom: false,
    })).toBe(false);
  });

  it('suppresses muted scope', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      resolvedPref: { notifyLevel: 'mentions', mutedUntil: new Date(Date.now() + 60_000) },
    })).toBe(true);
  });

  it('suppresses notifyLevel=nothing', () => {
    expect(shouldSuppress(basePayload, {
      ...baseCtx,
      resolvedPref: { notifyLevel: 'nothing', mutedUntil: null },
    })).toBe(true);
  });

  it('suppresses own-message echo (defensive)', () => {
    expect(shouldSuppress({ ...basePayload, senderPubkey: VIEWER }, baseCtx)).toBe(true);
  });

  it('suppresses forum reply when in same channel and same post', () => {
    expect(shouldSuppress(
      { ...basePayload, type: 'reply', postId: 'p1' },
      { ...baseCtx, documentVisible: true, windowFocused: true, activeChannelId: 'ch1', activePostId: 'p1', scrolledToBottom: true },
    )).toBe(true);
  });

  it('does NOT suppress forum reply when in same channel but different post', () => {
    expect(shouldSuppress(
      { ...basePayload, type: 'reply', postId: 'p1' },
      { ...baseCtx, documentVisible: true, windowFocused: true, activeChannelId: 'ch1', activePostId: 'p2', scrolledToBottom: true },
    )).toBe(false);
  });
});
