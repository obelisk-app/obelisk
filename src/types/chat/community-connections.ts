import type { ChannelPref } from '@/store/chat/channel-prefs';
export interface ConnectionEntry<T> { at: number; value: T | null }
export interface CommunityConnections {
  version: 1;
  relays: Record<string, ConnectionEntry<true>>;
  channels: Record<string, ConnectionEntry<ChannelPref>>;
}
