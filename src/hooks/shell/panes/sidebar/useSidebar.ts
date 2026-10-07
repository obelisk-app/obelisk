'use client';

import { useMemo, useState } from 'react';
import {
  useGroups,
  useGroupMetadataEose,
  useChildrenByParent,
  useRelayAccess,
} from '@/services/nostr-bridge';
import { useVoiceStore } from '@/store/voice';
import { applyLayout } from '@/services/relay/channel-layout';
import type { View } from '@/utils/shell/desktop/view';
import { indexGroupsById, rootGroups } from '@/utils/shell/panes/sidebar/sidebar-groups';
import { useGroupWotDistances, useSidebarOperatorData } from '@/hooks/shell/panes/sidebar/useSidebarData';

/**
 * The desktop sidebar's view model: the relay's channels laid out by the
 * operator's layout, the operator data for the header and editors, and the
 * states around the list.
 *
 * Creator-admin claim used to live here as a blanket loop that published a
 * kind 9000 ['admin'] for every visible group on every login. With 1000
 * channels that meant 1000 events per device per session, polluting the
 * relay-wide moderation log other NIP-29 clients render as an activity
 * feed. The claim is now lazy: see `useCreatorAdminClaim` (panes/channel/).
 */
export function useSidebar(relay: string, setView: (v: View) => void) {
  const groups = useGroups();
  const childrenByParent = useChildrenByParent();
  const groupsById = useMemo(() => indexGroupsById(groups), [groups]);
  const roots = useMemo(() => rootGroups(groups, groupsById), [groups, groupsById]);
  const operator = useSidebarOperatorData(relay);
  const groupDistanceById = useGroupWotDistances(groups);
  // Read-side surface (cached channels from seedCacheForRelay) renders
  // unconditionally: hiding it on AUTH failure made the site feel broken
  // (an empty sidebar with no explanation). The RelayAccessBanner explains
  // the situation when access != 'ok'. Write-side actions (the create form)
  // and the list's own empty states still gate on `channelsVisible`.
  const relayAccess = useRelayAccess(relay || null);
  const laidOut = useMemo(
    () => applyLayout(operator.layout, roots.map((g) => g.id)),
    [operator.layout, roots],
  );
  const groupMetadataEose = useGroupMetadataEose();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The desktop FloatingUserPanel (SidebarMe pill, plus VoiceStatusBar when a
  // call is active) sits absolutely over the bottom of the channel list; the
  // list pads further while in a call so its last channels scroll clear.
  const inVoice = useVoiceStore((s) => !!s.currentVoiceChannelId);

  return {
    groups,
    childrenByParent,
    groupsById,
    roots,
    laidOut,
    operator,
    groupDistanceById,
    channelsVisible: relayAccess === 'ok',
    groupMetadataEose,
    inVoice,
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    selectGroup: (groupId: string) => setView({ kind: 'group', groupId }),
  };
}
