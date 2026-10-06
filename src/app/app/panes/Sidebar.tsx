'use client';

import { useMemo, useState } from 'react';
import {
  useGroups,
  useGroupMetadataEose,
  useChildrenByParent,
  useRelayAccess,
} from '@/services/nostr-bridge';
import VoiceStatusBar from '@/components/voice/VoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { applyLayout } from '@/services/channel-layout';
import { useTranslation } from '@/i18n/context';
import type { View } from '../view';
import { CreateGroupSection } from './CreateGroupSection';
import { SidebarMe } from './SidebarMe';
import { ChannelTree } from './sidebar/ChannelTree';
import { RelayAdminModals } from './sidebar/RelayAdminModals';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { useGroupWotDistances, useSidebarOperatorData } from '@/hooks/app/panes/sidebar/useSidebarData';

export function Sidebar({
  relay,
  conn,
  view,
  setView,
}: {
  relay: string;
  conn: string;
  view: View;
  setView: (v: View) => void;
}) {
  const groups = useGroups();
  const childrenByParent = useChildrenByParent();
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const roots = useMemo(
    () => groups.filter((g) => !g.parent || !groupsById[g.parent]),
    [groups, groupsById],
  );
  const { t } = useTranslation();
  const operator = useSidebarOperatorData(relay);
  const groupDistanceById = useGroupWotDistances(groups);
  // Read-side surface (cached channels from seedCacheForRelay) renders
  // unconditionally - hiding it on AUTH failure made the site feel broken
  // (empty sidebar with no explanation). The RelayAccessBanner above the
  // list explains the situation when access != 'ok'. Write-side actions
  // (CreateGroupSection) and any UI that would let the user act on a
  // channel they can't actually read still gate on `channelsVisible`.
  const relayAccess = useRelayAccess(relay || null);
  const channelsVisible = relayAccess === 'ok';
  const laidOut = useMemo(
    () => applyLayout(operator.layout, roots.map((g) => g.id)),
    [operator.layout, roots],
  );
  const groupMetadataEoseGlobal = useGroupMetadataEose();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The desktop FloatingUserPanel (SidebarMe pill, plus VoiceStatusBar when a
  // call is active) sits absolutely over the bottom of the channel list. Pad
  // the scroll container so the last channels can be scrolled clear of it.
  const inVoice = useVoiceStore((s) => !!s.currentVoiceChannelId);

  // Creator-admin claim used to live here as a blanket loop that published a
  // kind 9000 ['admin'] for every visible group on every login (gated only by
  // sessionStorage). With 1000 channels that meant 1000 events per device per
  // session, polluting the relay-wide moderation log that other NIP-29 clients
  // render as an activity feed. The claim is now lazy: see
  // `useCreatorAdminClaim` (panes/channel/), which calls
  // `nostrActions.claimCreatorAdmin(groupId)` exactly once, only when the
  // local user is the kind 9007 creator and isn't already in 39001.

  return (
    <>
      <SidebarHeader
        relay={relay}
        conn={conn}
        branding={operator.branding}
        brandingLoaded={operator.brandingLoaded}
        showTitleSkeleton={operator.showTitleSkeleton}
        isRelayOperator={operator.isRelayOperator}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {channelsVisible && (
        <CreateGroupSection
          count={groups.length}
          onCreated={(id) => setView({ kind: 'group', groupId: id })}
        />
      )}

      <div
        // `pb-28`, not `pb-20`: the panel is `bottom-3` (12px) plus a pill
        // whose `min-h-[3.5rem]` is only a floor - `SidebarMe` stacks the
        // name over a truncated npub and puts a gear beside them, so the
        // real height overran the 80px reserved and the last channel
        // (`HACKATONS 2026` on La Crypta) scrolled in behind it.
        className={`flex-1 overflow-y-auto px-2 pb-2 ${inVoice ? 'md:pb-52' : 'md:pb-28'}`}
        data-tour="channels-list"
      >
        {/* Relay/AUTH state lives in the unified bottom-right activity stack. */}
        {groups.length === 0 && channelsVisible && !groupMetadataEoseGlobal && (
          <div
            className="px-2 py-3 flex items-center gap-2 text-xs text-lc-muted"
            data-testid="channels-loading"
          >
            <div className="lc-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span>{t('desktop.channels.loading')}</span>
          </div>
        )}
        {groups.length === 0 && channelsVisible && groupMetadataEoseGlobal && (
          <div
            className="px-2 py-3 text-xs text-lc-muted"
            data-testid="channels-empty"
          >
            {t('desktop.channels.empty')}
          </div>
        )}
        <ChannelTree
          laidOut={laidOut}
          groupsById={groupsById}
          childrenByParent={childrenByParent}
          view={view}
          onSelect={(gid) => setView({ kind: 'group', groupId: gid })}
          distanceById={groupDistanceById}
        />
      </div>
      <RelayAdminModals
        relay={relay}
        isRelayOperator={operator.isRelayOperator}
        settingsOpen={settingsOpen}
        onCloseSettings={() => setSettingsOpen(false)}
        layout={operator.layout}
        channels={roots}
        branding={operator.branding}
        emojiSet={operator.emojiSet}
        relayRoles={operator.relayRoles}
      />

      <div className="shrink-0 border-t border-lc-border bg-lc-card/50 md:hidden">
        <VoiceStatusBar />
        <div className="p-2">
          <SidebarMe />
        </div>
      </div>
    </>
  );
}
