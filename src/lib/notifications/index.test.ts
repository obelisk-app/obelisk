import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationCenter } from './index';
import type { NotificationPayload } from './suppression';

const VIEWER = 'npub_me';

const basePayload: NotificationPayload = {
  recipientPubkey: VIEWER,
  type: 'mention',
  channelId: 'ch1',
  serverId: 's1',
  messageId: 'm1',
  senderPubkey: 'npub_alice',
  senderName: 'Alice',
  preview: 'hey check this out',
  createdAt: new Date().toISOString(),
  scopeChain: [{ type: 'channel', id: 'ch1' }, { type: 'server', id: 's1' }],
};

let lastNotification: { title: string; opts: NotificationOptions } | null = null;
let soundPlayed = false;

beforeEach(() => {
  lastNotification = null;
  soundPlayed = false;
  (globalThis as any).Notification = vi.fn().mockImplementation((title: string, opts: NotificationOptions) => {
    lastNotification = { title, opts };
    return { close: vi.fn() };
  });
  (globalThis as any).Notification.permission = 'granted';
  globalThis.localStorage?.clear?.();
});

const ctxAlwaysShow = {
  viewerPubkey: VIEWER,
  prefs: [],
  channelNameById: (id: string) => id === 'ch1' ? 'general' : id,
  resolveSuppressionContext: () => ({
    viewerPubkey: VIEWER,
    documentVisible: false,
    windowFocused: false,
    activeChannelId: null,
    activePostId: null,
    scrolledToBottom: false,
    resolvedPref: { notifyLevel: 'mentions' as const, mutedUntil: null },
  }),
  playSound: () => { soundPlayed = true; },
};

describe('NotificationCenter.notify', () => {
  it('shows OS notification with channel-style title for channel mention', () => {
    NotificationCenter.notify(basePayload, ctxAlwaysShow);
    expect(lastNotification?.title).toBe('#general');
    expect(lastNotification?.opts.body).toBe('hey check this out');
    expect(lastNotification?.opts.tag).toBe('ch1');
    expect(soundPlayed).toBe(true);
  });

  it('uses sender name as title for DMs', () => {
    NotificationCenter.notify({
      ...basePayload,
      type: 'dm',
      channelId: undefined,
      serverId: undefined,
      scopeChain: [{ type: 'dm', id: 'npub_alice' }],
    }, ctxAlwaysShow);
    expect(lastNotification?.title).toBe('Alice');
    expect(lastNotification?.opts.tag).toBe('npub_alice');
  });

  it('uses "sender in #channel" title for forum replies', () => {
    NotificationCenter.notify({
      ...basePayload,
      type: 'reply',
      postId: 'p1',
    }, ctxAlwaysShow);
    expect(lastNotification?.title).toBe('Alice in #general');
    expect(lastNotification?.opts.tag).toBe('p1');
  });

  it('skips notification + sound when suppressed', () => {
    NotificationCenter.notify(basePayload, {
      ...ctxAlwaysShow,
      resolveSuppressionContext: () => ({
        viewerPubkey: VIEWER,
        documentVisible: true,
        windowFocused: true,
        activeChannelId: 'ch1',
        activePostId: null,
        scrolledToBottom: true,
        resolvedPref: { notifyLevel: 'mentions', mutedUntil: null },
      }),
    });
    expect(lastNotification).toBeNull();
    expect(soundPlayed).toBe(false);
  });

  it('skips OS notification when permission is not granted but still plays sound', () => {
    (globalThis as any).Notification.permission = 'default';
    NotificationCenter.notify(basePayload, ctxAlwaysShow);
    expect(lastNotification).toBeNull();
    expect(soundPlayed).toBe(true);
  });

  it('skips sound when sound preference is off', () => {
    globalThis.localStorage.setItem('obelisk:notif-sound-enabled', 'false');
    NotificationCenter.notify(basePayload, ctxAlwaysShow);
    expect(soundPlayed).toBe(false);
  });
});
