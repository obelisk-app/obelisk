import { combineLatest, type Subscription } from 'rxjs';
import type { ConcordClient, ConcordCommunity } from '@applesauce/concord/client';
import { useConcordReadStore } from '@/store/chat/concord-read';
import { computeChannelHighlights, effectiveCursor } from '@/services/read-state/selectors';
import { projectConcordTimeline } from '@/utils/chat/concord/timeline';
import { concordPublicationData } from '@/utils/chat/concord/publications';
import { concordGroup, concordMessage } from '@/utils/chat/concord/presentation';
import { CONCORD_READ_LIMIT } from '@/constants/chat/concord-read';

/** Observe SDK local stores only; this does not open channel relay subscriptions. */
export function startConcordReadHighlights(client: ConcordClient) {
  const communities = new Map<string, () => void>();
  let observed = 0;
  const watch = (community: ConcordCommunity) => {
    const channels = new Map<string, { sub: Subscription; stop: () => void }>();
    const channelSub = community.channels$.subscribe(rows => {
      const ids = new Set(rows.filter(row => row.accessible).map(row => row.channel_id));
      for (const [id, entry] of channels) if (!ids.has(id)) { entry.stop(); channels.delete(id); }
      for (const id of ids) {
        if (channels.has(id) || observed >= CONCORD_READ_LIMIT) continue;
        observed++;
        const key = `concord:${community.communityId}:${id}`;
        let update = () => {};
        const sub = combineLatest([community.channelTimeline(id), community.state$]).subscribe(([rumors, state]) => {
          const rows = projectConcordTimeline(rumors, state, id);
          const messages = rows.map(concordMessage);
          const channel = state.channels.find(row => row.channel_id === id);
          const publications = concordPublicationData(channel ? concordGroup(community.communityId, channel) : undefined, rows);
          update = () => {
            const store = useConcordReadStore.getState();
            const readAt = new Map<string, number>();
            for (const [thread, entries] of Object.entries(publications.messagesByGroup)) for (const message of entries) readAt.set(message.id, Math.max(readAt.get(message.id) ?? 0, store.cursors[thread] ?? 0));
            const cursor = effectiveCursor(store.cursors[key]);
            const marked = messages.map(message => message.createdAt * 1000 <= Math.max(cursor, readAt.get(message.id) ?? 0) ? { ...message, createdAt: 0 } : message);
            store.setHighlights(community.pubkey, key, computeChannelHighlights(marked, 0, community.pubkey));
          };
          update();
        });
        const stopCursor = useConcordReadStore.subscribe((next, previous) => { if (next.cursors !== previous.cursors) update(); });
        channels.set(id, { sub, stop: () => { observed--; sub.unsubscribe(); stopCursor(); useConcordReadStore.getState().setHighlights(community.pubkey, key, null); } });
      }
    });
    return () => { channelSub.unsubscribe(); for (const entry of channels.values()) entry.stop(); };
  };
  const sub = client.communities$.subscribe(rows => {
    const ids = new Set(rows.map(row => row.material.community_id));
    for (const [id, stop] of communities) if (!ids.has(id)) { stop(); communities.delete(id); }
    for (const id of ids) { const community = client.getCommunity(id); if (community && !communities.has(id)) communities.set(id, watch(community)); }
  });
  return () => { sub.unsubscribe(); for (const stop of communities.values()) stop(); communities.clear(); };
}
