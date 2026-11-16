import type { CommunityConnections, ConnectionEntry } from '@/types/chat/community-connections';
import type { ChannelPref } from '@/store/chat/channel-prefs';
import { normalizePublicRelayUrl } from '@/utils/relay-url/public-relay';
import { COMMUNITY_CONNECTIONS_BYTE_LIMIT } from '@/constants/chat/community-connections';

export function parseCommunityConnections(text: string): CommunityConnections {
  if (new TextEncoder().encode(text).length > COMMUNITY_CONNECTIONS_BYTE_LIMIT) throw new Error('Account data too large');
  const data = JSON.parse(text);
  if (data?.version !== 1 || !data.relays || !data.channels) throw new Error('Invalid community connections');
  const entry = (raw: unknown) => {
    const row = raw as ConnectionEntry<unknown>;
    return row && Number.isSafeInteger(row.at) && row.at > 0 && row.at <= Date.now() + 300_000 ? row : null;
  };
  const relays: CommunityConnections['relays'] = {};
  for (const [key, raw] of Object.entries(data.relays).slice(0, 128)) {
    const row = entry(raw), url = normalizePublicRelayUrl(key);
    if (row && url && (row.value === true || row.value === null)) relays[url] = { at: row.at, value: row.value };
  }
  const channels: CommunityConnections['channels'] = {};
  for (const [key, raw] of Object.entries(data.channels).slice(0, 1000)) {
    const row = entry(raw);
    if (!row || key.length > 768 || !key.includes('|')) continue;
    if (row.value === null) { channels[key] = { at: row.at, value: null }; continue; }
    const value = row.value as ChannelPref;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const pref: { unfollowed?: boolean; mutedUntil?: number; notify?: ChannelPref['notify'] } = {};
    if (typeof value.unfollowed === 'boolean') pref.unfollowed = value.unfollowed;
    if (typeof value.mutedUntil === 'number' && Number.isFinite(value.mutedUntil)) pref.mutedUntil = value.mutedUntil;
    if (value.notify === 'all' || value.notify === 'mentions' || value.notify === 'nothing') pref.notify = value.notify;
    channels[key] = { at: row.at, value: pref };
  }
  return { version: 1, relays, channels };
}
