import { useRecentChannels } from '@/hooks/chat/channel/useRecentChannels';
import { channelHierarchy } from '@/utils/chat/channel/channel-hierarchy';
import { useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useActiveCallByChannel,
  useConfiguredRelays,
  useConnectionState,
  useCurrentRelayUrl,
  useGroupMetadataEose,
  useGroups,
  useRelayAccess,
  type JsGroup,
} from '@/services/nostr-bridge';
import { applyLayout } from '@/services/relay/channel-layout';
import { useScreenScrollMemo } from '@/hooks/shell/mobile/carousel/useScreenScrollMemo';
import { useRelayOperatorData } from '@/hooks/relay/operator/useRelayOperatorData';
import { useRelayHeaderInfo } from '@/hooks/relay/info/useRelayHeaderInfo';
import { descendantRows } from '@/utils/shell/panes/sidebar/channel-tree';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { channelsFromIds, indexById, spaceLabel, toggleKey } from '@/utils/shell/mobile/channel-list';

export interface RelayMenuTarget { url: string; label: string; iconUrl: string | null }

/**
 * The phone server screen: the active relay picker and banner, the
 * channel list laid out by the operator's categories (each collapsible, a
 * forum expandable to its threads), and the add-relay, new-channel and
 * relay-menu sheets. The roots and layout match the desktop sidebar's.
 */
export function useServerScreen(selectGroup: (groupId: string, kind: JsGroup['kind']) => void) {
  const groups = useGroups();
  const relay = useCurrentRelayUrl();
  const calls = useActiveCallByChannel();
  const [addRelayOpen, setAddRelayOpen] = useState(false);
  const [relayMenuFor, setRelayMenuFor] = useState<RelayMenuTarget | null>(null);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});
  const channelListRef = useRef<HTMLDivElement>(null);
  useScreenScrollMemo(`server:${relay ?? ''}`, channelListRef);

  const activeRelayInfo = useRelayHeaderInfo(relay);
  const groupsById = useMemo(() => indexById(groups), [groups]);
  const { roots, childrenByParent } = useMemo(() => channelHierarchy(groups), [groups]);
  // Relay-wide settings trust the validated human operator identity only;
  // roles and emojis are fanned into the chat store by the shared hook.
  const operator = useRelayOperatorData(relay);
  const recentSubchannelIds = useRecentChannels(relay, groups, childrenByParent);
  const laidOut = useMemo(() => applyLayout(operator.layout, roots.map((g) => g.id)), [operator.layout, roots]);

  // Prefer the operator-published kind-30078 branding (matches the desktop
  // banner), then the NIP-11 document, then the URL host.
  const label = spaceLabel(operator.branding.name, activeRelayInfo.name, relay);
  const icon = operator.branding.icon || activeRelayInfo.icon || null;

  return {
    relay,
    relays: useConfiguredRelays(),
    relayAccess: useRelayAccess(relay || null),
    connectionState: useConnectionState(),
    metadataEose: useGroupMetadataEose(),
    channelListRef,
    roots,
    laidOut,
    operator,
    space: { label, icon, banner: operator.branding.banner || null },
    channelsIn: (ids: ReadonlyArray<string>) => channelsFromIds(ids, groupsById),
    isCollapsed: (catId: string) => !!collapsedCats[catId],
    toggleCategory: (catId: string) => setCollapsedCats((c) => toggleKey(c, catId)),
    /** A row's call marker and, for a forum with threads, its expansion. */
    entryFor: (g: JsGroup) => {
      const childIds = childrenByParent[g.id] ?? [];
      const key = JSON.stringify([relay, g.id]);
      const expanded = !!expandedChannels[key];
      const descendants = descendantRows(childIds, childrenByParent, groupsById);
      const expandable = childIds.length > 0;
      return {
        live: !!calls[g.id],
        expandable,
        expanded,
        threads: descendants
          .filter(({ group }) => expanded || recentSubchannelIds.has(group.id))
          .map(({ group }) => ({ group, showAsChannel: g.kind !== 'forum' || recentSubchannelIds.has(group.id) })),
        onToggleExpand: expandable ? () => setExpandedChannels((current) => toggleKey(current, key)) : undefined,
      };
    },
    openChannel: (g: JsGroup) => selectGroup(g.id, g.kind),
    selectRelay: (url: string) => {
      if (normalizeRelayUrl(url) !== normalizeRelayUrl(relay ?? '')) void nostrActions.switchRelay(url);
    },
    addRelayOpen,
    openAddRelay: () => setAddRelayOpen(true),
    closeAddRelay: () => setAddRelayOpen(false),
    createChannelOpen: createChannelOpen && !!relay,
    openCreateChannel: () => {
      if (relay) setCreateChannelOpen(true);
    },
    closeCreateChannel: () => setCreateChannelOpen(false),
    onChannelCreated: (id: string) => selectGroup(id, 'text'),
    relayMenuFor,
    openRelayMenu: setRelayMenuFor,
    openActiveRelayMenu: () => {
      if (relay) setRelayMenuFor({ url: relay, label, iconUrl: icon });
    },
    closeRelayMenu: () => setRelayMenuFor(null),
  };
}

export type ServerScreenModel = ReturnType<typeof useServerScreen>;
