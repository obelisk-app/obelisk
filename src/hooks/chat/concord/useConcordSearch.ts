import { useEffect, useMemo, useState } from 'react';
import { combineLatest } from 'rxjs';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import { projectConcordTimeline } from '@/utils/chat/concord/timeline';
import { concordMessage } from '@/utils/chat/concord/presentation';

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
        setMessages(rows.flatMap((rumors, index) => projectConcordTimeline(rumors, state, accessible[index].channel_id).map(row => ({ ...concordMessage(row), groupId: `concord:${community.communityId}:${accessible[index].channel_id}` }))));
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
