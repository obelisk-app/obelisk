'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { Rumor, ChannelMetadata } from '@applesauce/concord';
import { useConcordBranding } from './useConcordBranding';
import { useConcordNavigation } from '@/store/chat/concord';
import { projectConcordTimeline } from '@/utils/chat/concord/timeline';
import { errorText } from '@/utils/errors/error-text';
import { PERM } from '@/constants/chat/concord';
import { refoundAuthority } from '@applesauce/concord/helpers';
import type { MediaAttachment } from '@applesauce/concord/helpers';
import { downloadConcordAttachment } from '@/services/chat/concord/media';
import { concordGroup, concordMessage } from '@/utils/chat/concord/presentation';
import { concordChannelProtocol } from '@/services/chat/concord/channel-protocol';
import type { JsMessage } from '@/services/nostr-bridge';
import { groupConcordChannels } from '@/utils/chat/concord/channels';

export function useConcordRoom(community: ConcordCommunity) {
  const t = useTranslations();
  const appearance = useConcordBranding(community);
  const selected = useConcordNavigation(state => state.channelId);
  const selectChannel = useConcordNavigation(state => state.selectChannel);
  const [state, setState] = useState(community.state$.value);
  const [channels, setChannels] = useState<Array<ChannelMetadata & { accessible: boolean }>>([]);
  const [timeline, setTimeline] = useState<{ channelId: string; rumors: Rumor[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [settings, setSettings] = useState<'community' | 'channels' | 'roles' | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [replyingTo, setReplyingTo] = useState<JsMessage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const channelId = channels.some(channel => channel.accessible && channel.channel_id === selected) ? selected! : channels.find(channel => channel.accessible)?.channel_id;
  useEffect(() => {
    const sub = community.state$.subscribe(setState);
    const channelSub = community.channels$.subscribe(setChannels);
    return () => { sub.unsubscribe(); channelSub.unsubscribe(); };
  }, [community]);
  useEffect(() => {
    if (!channelId) return;
    const sub = community.channelTimeline(channelId).subscribe(next => setTimeline({ channelId, rumors: next }));
    return () => sub.unsubscribe();
  }, [community, channelId]);
  const rows = useMemo(() => channelId && timeline?.channelId === channelId ? projectConcordTimeline(timeline.rumors, state, channelId) : [], [timeline, state, channelId]);
  const files = useMemo(() => new Map<string, File>(), []);
  const protocol = useMemo(() => concordChannelProtocol(community, channelId ?? '', timeline && timeline.channelId === channelId ? timeline.rumors : [], files), [community, channelId, timeline, files]);
  const messages = useMemo(() => rows.map(concordMessage), [rows]);
  const reactions = useMemo(() => Object.fromEntries(rows.map(row => [row.rumor.id, row.reactionEvents.map(event => ({ id: event.id, pubkey: event.pubkey, emoji: event.content, targetEventId: row.rumor.id, createdAt: event.created_at }))])), [rows]);
  const messagesById = useMemo(() => new Map(messages.map(message => [message.id, message])), [messages]);
  const groups = useMemo(() => channels.filter(channel => channel.accessible).map(channel => concordGroup(community.communityId, channel)), [community, channels]);
  const group = groups.find(group => group.id.endsWith(`:${channelId}`));
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages.length, channelId]);
  const run = async (operation: () => Promise<unknown>) => {
    setError(null);
    try { await operation(); } catch (err) { setError(errorText(t, err, 'chat.concord.failed')); }
  };
  return {
    branding: appearance.branding, canEditBranding: appearance.canEdit,
    state, channels, rows, channelId, selectChannel, error, invite, protocol, groups, group, messages, messagesById, reactions, scroller,
    settings, openSettings: () => setSettings('community'), closeSettings: () => setSettings(null),
    openChannelSettings: () => setSettings('channels'), openRoleSettings: () => setSettings('roles'),
    showMembers, toggleMembers: () => setShowMembers(value => !value), replyingTo, setReplyingTo,
    selectGroup: (id: string) => selectChannel(id.split(':').at(-1)!),
    categories: groupConcordChannels(channels).map(category => ({ name: category.name, groups: category.channels.filter(channel => channel.accessible).map(channel => concordGroup(community.communityId, channel)) })),
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
