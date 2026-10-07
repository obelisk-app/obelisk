/**
 * Chat: channel. The channel menu's mute and notification choices, read by
 * `utils/chat/channel/channel-menu-options.ts`.
 */

import type { ChannelNotifyLevel } from '@/store/chat/channel-prefs';
import type { MessageKey } from '@/i18n/keys';
import { MUTED_FOREVER } from '@/constants/chat/channel-prefs';

export const MUTE_OPTIONS: ReadonlyArray<{ key: MessageKey; ms: number }> = [
  { key: 'chat.channelMenu.mute.15m', ms: 15 * 60_000 },
  { key: 'chat.channelMenu.mute.1h', ms: 60 * 60_000 },
  { key: 'chat.channelMenu.mute.8h', ms: 8 * 60 * 60_000 },
  { key: 'chat.channelMenu.mute.24h', ms: 24 * 60 * 60_000 },
  { key: 'chat.channelMenu.mute.forever', ms: MUTED_FOREVER },
];

export const NOTIFY_OPTIONS: ReadonlyArray<{ level: ChannelNotifyLevel; key: MessageKey }> = [
  { level: 'all', key: 'chat.channelMenu.notify.all' },
  { level: 'mentions', key: 'chat.channelMenu.notify.mentions' },
  { level: 'nothing', key: 'chat.channelMenu.notify.nothing' },
];
