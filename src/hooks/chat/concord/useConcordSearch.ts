import { useEffect, useMemo, useState } from 'react';
import { combineLatest } from 'rxjs';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import { projectConcordTimeline } from '@/utils/chat/concord/timeline';
import { concordPublicationData } from '@/utils/chat/concord/publications';
import { concordGroup, concordMessage } from '@/utils/chat/concord/presentation';

/** Search authenticated, locally loaded history; never send plaintext search to a relay. */
export function useConcordSearch(community: ConcordCommunity, groups: JsGroup[]) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Array<JsMessage & { groupId: string }>>([]);
  useEffect(() => {
    let stop = () => {};
    const sub = community.channels$.subscribe(channels => {
      stop();
      const accessible = channels.filter(channel => channel.accessible);
      if (!accessible.length) { setMessages([]); return; }
      const timelines = combineLatest([community.state$, ...accessible.map(channel => community.channelTimeline(channel.channel_id))]).subscribe(([state, ...rows]) => {
        setMessages(rows.flatMap((rumors, index) => {
          const channel = accessible[index];
          const group = concordGroup(community.communityId, channel);
          const timeline = projectConcordTimeline(rumors, state, channel.channel_id);
          const publications = concordPublicationData(group, timeline);
          const threads = new Map(Object.entries(publications.messagesByGroup).flatMap(([id, messages]) => messages.map(message => [message.id, id] as const)));
          return timeline.map(row => ({ ...concordMessage(row), groupId: threads.get(row.rumor.id) ?? group.id }));
        }));
      });
      stop = () => timelines.unsubscribe();
    });
    return () => { sub.unsubscribe(); stop(); };
  }, [community]);
  const term = query.trim().toLocaleLowerCase();
  const channels = useMemo(() => groups.filter(group => (group.name ?? '').toLocaleLowerCase().includes(term)), [groups, term]);
  const hits = useMemo(() => term ? messages.filter(message => message.content.toLocaleLowerCase().includes(term)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50) : [], [messages, term]);
  return { query, setQuery, channels, hits };
}
