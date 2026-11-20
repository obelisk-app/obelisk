'use client';

import { useConcordMarkRead } from './useConcordMarkRead';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from '@/hooks/common/useForm';
import { concordInviteForm } from '@/services/chat/concord/invite-form';
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
import { concordGroup, concordMessage, mergeConcordPending } from '@/utils/chat/concord/presentation';
import { concordChannelProtocol } from '@/services/chat/concord/channel-protocol';
import type { JsMessage } from '@/services/nostr-bridge';
import { concordOutbox, type ConcordPendingMessage } from '@/services/chat/concord/outbox';
import { concordPublicationData, concordThreadMessages } from '@/utils/chat/concord/publications';
import { concordCommunityLayout } from '@/utils/chat/concord/layout';
import { publishConcordLayout } from '@/services/chat/concord/layout';
import { applyLayout } from '@/services/relay/channel-layout';
import { categoryLabel } from '@/utils/relay/category-label';
import { concordChannelParents, concordChannelLayout } from '@/utils/chat/concord/channels';

export function useConcordRoom(community: ConcordCommunity) {
  const t = useTranslations();
  const [pending, setPending] = useState<ConcordPendingMessage[]>([]);
  useEffect(() => { const sub = concordOutbox(community).rows$.subscribe(setPending); return () => sub.unsubscribe(); }, [community]);
  const appearance = useConcordBranding(community);
  const selected = useConcordNavigation(state => state.channelId);
  const threadId = useConcordNavigation(state => state.threadId);
  const selectChannel = useConcordNavigation(state => state.selectChannel);
  const [state, setState] = useState(community.state$.value);
  const [channels, setChannels] = useState<Array<ChannelMetadata & { accessible: boolean }>>([]);
  const [timeline, setTimeline] = useState<{ channelId: string; rumors: Rumor[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [invite, setInvite] = useState('');
  const inviteForm = useForm(concordInviteForm(community, setInvite));
  const [settings, setSettings] = useState<'community' | 'branding' | 'invite' | 'layout' | 'channels' | 'roles' | 'edit-channel' | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const showMembers = useConcordNavigation(nav => nav.membersOpen);
  const setShowMembers = useConcordNavigation(nav => nav.setMembersOpen);
  const [replyingTo, setReplyingTo] = useState<JsMessage | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const channelId = channels.some(channel => channel.accessible && channel.view !== 'voice' && channel.channel_id === selected) ? selected! : channels.find(channel => channel.accessible && channel.view !== 'voice')?.channel_id;
  useEffect(() => {
    const sub = community.state$.subscribe(setState);
    const channelSub = community.channels$.subscribe(setChannels);
    return () => { sub.unsubscribe(); channelSub.unsubscribe(); };
  }, [community]);
  // Loading a default channel must not turn a community-list visit into a chat visit.
  useEffect(() => { if (channelId && selected !== channelId) useConcordNavigation.setState({ channelId, threadId: null }); }, [channelId, selected]);
  useEffect(() => {
    if (!channelId) return;
    const sub = community.channelTimeline(channelId).subscribe(next => setTimeline({ channelId, rumors: next }));
    return () => sub.unsubscribe();
  }, [community, channelId]);
  const rows = useMemo(() => channelId && timeline?.channelId === channelId ? projectConcordTimeline(timeline.rumors, state, channelId) : [], [timeline, state, channelId]);
  const files = useMemo(() => new Map<string, File>(), []);
  const baseGroups = useMemo(() => {
    const accessible = channels.filter(channel => channel.accessible && channel.view !== 'voice').sort((a, b) => concordChannelLayout(a).position - concordChannelLayout(b).position || a.name.localeCompare(b.name));
    const parents = concordChannelParents(accessible);
    return accessible.map(channel => ({ ...concordGroup(community.communityId, channel), parent: parents.has(channel.channel_id) ? `concord:${community.communityId}:${parents.get(channel.channel_id)}` : null }));
  }, [community, channels]);
  const layout = useMemo(() => concordCommunityLayout(state), [state]);
  const rootChannels = useMemo(() => baseGroups.filter(group => !group.parent), [baseGroups]);
  const laidOut = useMemo(() => applyLayout(layout, rootChannels.map(group => group.id)), [layout, rootChannels]);
  const channelGroup = baseGroups.find(group => group.id === `concord:${community.communityId}:${channelId}`);
  const publications = useMemo(() => concordPublicationData(channelGroup, rows), [channelGroup, rows]);
  const groups = useMemo(() => [...baseGroups, ...publications.groups], [baseGroups, publications]);
  const groupsById = useMemo(() => Object.fromEntries(groups.map(group => [group.id, group])), [groups]);
  const childrenByParent = useMemo(() => {
    const tree: Record<string, string[]> = {};
    for (const group of groups) if (group.parent) (tree[group.parent] ??= []).push(group.id);
    return tree;
  }, [groups]);
  const thread = threadId ? rows.find(row => row.rumor.id === threadId)?.rumor : undefined;
  const group = thread ? groups.find(item => item.id.endsWith(`:thread:${thread.id}`)) ?? channelGroup : channelGroup;
  const protocol = useMemo(() => ({
    ...concordChannelProtocol(community, channelId ?? '', timeline && timeline.channelId === channelId ? timeline.rumors : [], files, thread),
    pending: (id: string) => pending.find(row => row.message.id === id),
    communityName: appearance.branding.name,
    openSearch: () => setSearching(true),
    publishLayout: (next: typeof layout, expected: typeof layout) => publishConcordLayout(community, next, expected),
    forum: { groups, childrenByParent, messagesByGroup: publications.messagesByGroup },
  }), [community, channelId, timeline, files, pending, thread, appearance.branding.name, groups, childrenByParent, publications.messagesByGroup]);
  const messages = useMemo(() => mergeConcordPending(thread ? concordThreadMessages(rows, thread) : rows.map(concordMessage), pending, channelId, thread?.id), [rows, pending, channelId, thread]);
  const reactions = useMemo(() => Object.fromEntries(rows.map(row => [row.rumor.id, row.reactionEvents.map(event => ({ id: event.id, pubkey: event.pubkey, emoji: event.content, targetEventId: row.rumor.id, createdAt: event.created_at }))])), [rows]);
  const messagesById = useMemo(() => new Map(messages.map(message => [message.id, message])), [messages]);
  useConcordMarkRead(community.pubkey, group?.id, messages, scroller, !!settings || searching || showMembers);
  const run = async (operation: () => Promise<unknown>) => {
    setError(null);
    try { await operation(); } catch (err) { setError(errorText(t, err, 'chat.concord.failed')); }
  };
  return {
    searching, openSearch: () => setSearching(true), closeSearch: () => setSearching(false),
    layout, rootChannels, collapsedCategories, toggleCategory: (id: string) => setCollapsedCategories(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    openBranding: () => setSettings('branding'), openInvite: () => setSettings('invite'),
    openMemberSettings: () => { setSettings(null); setShowMembers(true); },
    openLayout: () => setSettings('layout'), canManageLayout: !state.dissolved && community.canDo(PERM.MANAGE_METADATA),
    branding: appearance.branding, canEditBranding: appearance.canEdit,
    state, channels, rows, channelId, threadId: thread?.id ?? null, groupsById, childrenByParent, selectChannel, error, invite, protocol, groups, group, messages, messagesById, reactions, scroller,
    settings, openSettings: () => setSettings('community'), closeSettings: () => setSettings(null),
    editChannel: () => setSettings('edit-channel'),
    openChannelSettings: () => setSettings('channels'), openRoleSettings: () => setSettings('roles'),
    showMembers, toggleMembers: () => setShowMembers(!useConcordNavigation.getState().membersOpen), replyingTo, setReplyingTo,
    selectGroup: (id: string) => {
      setSearching(false);
      const [channel, selectedThread] = id.slice(`concord:${community.communityId}:`.length).split(':thread:');
      if (selectedThread) useConcordNavigation.getState().selectThread(channel, selectedThread);
      else selectChannel(channel);
    },
    categories: [...laidOut.categories, { id: '', name: t('mobile.layout.uncategorized'), channelIds: laidOut.uncategorized }].map(category => ({ id: category.id, name: categoryLabel(category.name, t), groups: category.channelIds.flatMap(id => groupsById[id] ? [groupsById[id]] : []) })).filter(category => category.id || category.groups.length),
    publication: channels.find(channel => channel.channel_id === channelId)?.view === 'forum' && !thread,
    download: (attachment: MediaAttachment) => run(() => downloadConcordAttachment(attachment)),
    members: [...state.members],
    canInvite: !state.dissolved && (community.pubkey === community.material.owner || community.canDo(PERM.CREATE_INVITE)),
    canManageChannels: !state.dissolved && community.canDo(PERM.MANAGE_CHANNELS),
    canManageRoles: !state.dissolved && community.canDo(PERM.MANAGE_ROLES),
    canDelete: (rumor: Rumor) => !state.dissolved && (rumor.pubkey === community.pubkey || refoundAuthority(state, PERM.MANAGE_MESSAGES, rumor.pubkey)(community.pubkey)),
    createInvite: () => inviteForm.submit(), inviting: inviteForm.submitting, inviteError: inviteForm.error,
    react: (rumor: Rumor) => run(() => community.react(channelId!, rumor, '+')),
    remove: (rumor: Rumor) => run(() => community.deleteMessage(channelId!, rumor)),
  };
}
