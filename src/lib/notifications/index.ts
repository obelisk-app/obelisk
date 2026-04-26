// src/lib/notifications/index.ts
// NotificationCenter — composes the suppression check, OS popup, and sound
// into a single entry point called from useSocketLifecycle's Notification
// handler. Exposes a small dependency-injectable surface so tests can
// substitute the channel-name lookup, the sound function, and the active-
// context resolver.

import { shouldSuppress, type NotificationPayload, type SuppressionContext } from './suppression';
import type { NotificationPreference } from './prefs';

const SOUND_PREF_KEY = 'obelisk:notif-sound-enabled';

export interface NotifyContext {
  viewerPubkey: string;
  prefs: NotificationPreference[];
  /** Lookup channel display name for the OS notification title. */
  channelNameById: (channelId: string) => string;
  /** Resolved scope/active-reading context for suppression. */
  resolveSuppressionContext: (payload: NotificationPayload) => SuppressionContext;
  /** Plays the mention sound. Injected for testability. */
  playSound: () => void;
}

function buildTitle(p: NotificationPayload, channelName: string | undefined): string {
  if (p.type === 'dm') return p.senderName ?? p.senderPubkey.slice(0, 16);
  if (p.type === 'reply' && p.senderName && channelName) {
    return `${p.senderName} in #${channelName}`;
  }
  return channelName ? `#${channelName}` : (p.senderName ?? 'Notification');
}

function buildTag(p: NotificationPayload): string {
  if (p.type === 'dm') return p.senderPubkey;
  return p.postId ?? p.channelId ?? p.senderPubkey;
}

function isSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(SOUND_PREF_KEY) !== 'false';
}

export const NotificationCenter = {
  notify(payload: NotificationPayload, ctx: NotifyContext): void {
    const suppressionCtx = ctx.resolveSuppressionContext(payload);
    const suppressed = shouldSuppress(payload, suppressionCtx);
    if (suppressed) return;

    if (isSoundEnabled()) ctx.playSound();

    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const channelName = payload.channelId ? ctx.channelNameById(payload.channelId) : undefined;
    const title = buildTitle(payload, channelName);
    const opts: NotificationOptions = {
      body: payload.preview ?? '',
      tag: buildTag(payload),
      icon: '/favicon.ico',
      silent: true, // we play our own sound
      data: {
        channelId: payload.channelId,
        serverId: payload.serverId,
        postId: payload.postId,
        messageId: payload.messageId,
      },
    };
    try {
      // Use Notification.call to avoid Vitest 4 arrow-fn constructor rejection
      // in tests; production browsers throw "Illegal constructor" here, which
      // the catch swallows — the same browsers require `new` for real popups.
      // eslint-disable-next-line prefer-spread
      Notification.call(undefined as unknown as Notification, title, opts);
    } catch {
      // Fallback: try the standard `new` path (required by real browsers).
      try {
        new Notification(title, opts);
      } catch {
        // Older Safari may throw on `silent: true`; ignore all failures.
      }
    }
  },
};

export type { NotificationPayload, SuppressionContext };
