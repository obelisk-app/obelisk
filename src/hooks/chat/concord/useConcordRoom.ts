'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { Rumor, ChannelMetadata } from '@applesauce/concord';
import { useConcordNavigation } from '@/store/chat/concord';
import { projectConcordTimeline } from '@/utils/chat/concord/timeline';
import { errorText } from '@/utils/errors/error-text';
import { PERM } from '@/constants/chat/concord';
import { refoundAuthority } from '@applesauce/concord/helpers';
import type { MediaAttachment } from '@applesauce/concord/helpers';
import { downloadConcordAttachment } from '@/services/chat/concord/media';
import { groupConcordChannels } from '@/utils/chat/concord/channels';

export function useConcordRoom(community: ConcordCommunity) {
  const t = useTranslations();
  const selected = useConcordNavigation(state => state.channelId);
  const selectChannel = useConcordNavigation(state => state.selectChannel);
  const [state, setState] = useState(community.state$.value);
  const [channels, setChannels] = useState<Array<ChannelMetadata & { accessible: boolean }>>([]);
  const [timeline, setTimeline] = useState<{ channelId: string; rumors: Rumor[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const channelId = channels.some(channel => channel.accessible && channel.channel_id === selected) ? selected! : channels.find(channel => channel.accessible)?.channel_id;
  useEffect(() => {
    const sub = community.state$.subscribe(setState);
    const channelSub = community.channels$.subscribe(setChannels);
    return () => { sub.unsubscribe(); channelSub.unsubscribe(); };
  }, [community]);
  useEffect(() => {
    if (!channelId) return;
    const sub = community.channelTimeline(channelId).subscribe(rumors => setTimeline({ channelId, rumors }));
    return () => sub.unsubscribe();
  }, [community, channelId]);
  const rows = useMemo(() => channelId && timeline?.channelId === channelId ? projectConcordTimeline(timeline.rumors, state, channelId) : [], [timeline, state, channelId]);
  const run = async (operation: () => Promise<unknown>) => {
    setError(null);
    try { await operation(); } catch (err) { setError(errorText(t, err, 'chat.concord.failed')); }
  };
  return {
    state, channels, rows, channelId, selectChannel, error, invite,
    categories: groupConcordChannels(channels),
    publication: channels.find(channel => channel.channel_id === channelId)?.view === 'forum',
    download: (attachment: MediaAttachment) => run(() => downloadConcordAttachment(attachment)),
    members: [...state.members],
    canInvite: !state.dissolved && community.canDo(PERM.CREATE_INVITE),
    canManageChannels: !state.dissolved && community.canDo(PERM.MANAGE_CHANNELS),
    canManageRoles: !state.dissolved && community.canDo(PERM.MANAGE_ROLES),
    canDelete: (rumor: Rumor) => !state.dissolved && (rumor.pubkey === community.pubkey || refoundAuthority(state, PERM.MANAGE_MESSAGES, rumor.pubkey)(community.pubkey)),
    createInvite: () => run(async () => {
      const result = await community.createInvite({ base: window.location.origin, label: 'Obelisk' });
      setInvite(result.url);
    }),
    react: (rumor: Rumor) => run(() => community.react(channelId!, rumor, '+')),
    remove: (rumor: Rumor) => run(() => community.deleteMessage(channelId!, rumor)),
  };
}
