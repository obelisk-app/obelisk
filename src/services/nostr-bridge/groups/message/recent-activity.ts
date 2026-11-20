import type { Filter } from 'nostr-tools';
import { RECENT_CHANNEL_WINDOW_SECONDS } from '@/constants/chat/channel-prefs';
import { KIND_GROUP_CHAT_MESSAGE } from '@/constants/nostr/nip-kinds';
import { getChannelPref, useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { channelHierarchy } from '@/utils/chat/channel/channel-hierarchy';
import { getTag } from '../../common/event-tags';
import type { PingsContext } from './pings';

const QUERY_LIMIT = 200;
const QUERY_TIMEOUT_MS = 4000;
const QUERY_CONCURRENCY = 4;

export async function catchUpChannelActivity(ctx: PingsContext, relay: string, active = () => true): Promise<void> {
  const session = ctx.session();
  const owner = session?.pubKeyHex;
  if (!owner || !relay || !ctx.queryRelaysWithConfidence) return;
  const isCurrent = () => active() && session === ctx.session() && relay === ctx.currentRelayUrl.get();
  const base = { kinds: [KIND_GROUP_CHAT_MESSAGE], since: Math.floor(Date.now() / 1000) - RECENT_CHANNEL_WINDOW_SECONDS };
  const query = async (filter: Filter) => {
    if (!isCurrent()) return;
    try {
      // Relay entry and reconnect should include messages since the last visit.
      const { events, complete } = await ctx.queryRelaysWithConfidence([relay], filter, QUERY_TIMEOUT_MS, { cache: 'fresh' });
      if (!isCurrent()) return;
      let matched = false;
      for (const event of events) {
        const id = getTag(event, 'h');
        if (!id || event.kind !== KIND_GROUP_CHAT_MESSAGE || (filter['#h'] && !filter['#h'].includes(id))) continue;
        const participated = event.pubkey === owner || event.tags.some(([name, value]) => name === 'p' && value === owner);
        if ((filter.authors || filter['#p']) && !participated) continue;
        useChannelPrefsStore.getState().recordActivity(relay, id, event.created_at, participated);
        matched ||= participated;
      }
      return { complete, matched };
    } catch {
      // Activity catch-up is best effort. The live stream remains active.
    }
  };

  // Existing signed messages in the relay-specific cache or timeline can
  // establish participation even if the three-day history window has passed.
  for (const [id, messages] of Object.entries(ctx.messagesByGroup.get())) {
    const participation = messages.findLast((message) => !message.pending && !message.failed
      && (message.pubkey === owner || message.mentions?.includes(owner)));
    if (participation) useChannelPrefsStore.getState().recordActivity(relay, id, participation.createdAt, true);
    const latest = messages.findLast((message) => !message.pending && !message.failed);
    if (latest) useChannelPrefsStore.getState().recordActivity(relay, id, latest.createdAt, false);
  }

  await Promise.all([
    query({ ...base, authors: [owner], limit: QUERY_LIMIT }),
    query({ ...base, '#p': [owner], limit: QUERY_LIMIT }),
  ]);

  const { childrenByParent } = channelHierarchy(ctx.groups.get());
  const subchannels = Object.values(childrenByParent).flat();
  const queryLatest = (id: string) => query({ kinds: base.kinds, '#h': [id], limit: 1 });
  const migrate = async (id: string) => {
    const pref = getChannelPref(relay, id);
    if (pref.unfollowed) return;
    if (pref.followed) {
      await queryLatest(id);
      return;
    }
    if (pref.historyChecked) return;

    // A single qualifying event establishes participation, regardless of age.
    const target = { kinds: base.kinds, '#h': [id], limit: 1 };
    const [posted, tagged] = await Promise.all([
      query({ ...target, authors: [owner] }),
      query({ ...target, '#p': [owner] }),
    ]);
    if (!isCurrent()) return;
    if (posted?.matched || tagged?.matched) await queryLatest(id);
    else if (posted?.complete && tagged?.complete) {
      useChannelPrefsStore.getState().markHistoryChecked(relay, id);
    }
  };

  for (let offset = 0; offset < subchannels.length && isCurrent(); offset += QUERY_CONCURRENCY / 2) {
    await Promise.all(subchannels.slice(offset, offset + QUERY_CONCURRENCY / 2).map(migrate));
  }
}
