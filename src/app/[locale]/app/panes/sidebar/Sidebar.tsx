'use client';

import Text from '@/components/ui/layout/Text';
import VoiceStatusBar from '@/components/voice/status-bar/VoiceStatusBar';
import { useTranslations } from 'next-intl';
import type { View } from '@/utils/shell/desktop/view';
import { CreateGroupSection } from './CreateGroupSection';
import { SidebarMe } from './SidebarMe';
import { ChannelTree } from './ChannelTree';
import { RelayAdminModals } from './RelayAdminModals';
import { SidebarHeader } from './SidebarHeader';
import { useSidebar } from '@/hooks/shell/panes/sidebar/useSidebar';

/**
 * The desktop channel sidebar: the relay header, the new-channel form, the
 * channel tree and the operator's editors. State comes from `useSidebar`.
 */
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
  const t = useTranslations();
  const vm = useSidebar(relay, setView);

  return (
    <>
      <SidebarHeader
        relay={relay}
        conn={conn}
        branding={vm.operator.branding}
        brandingLoaded={vm.operator.brandingLoaded}
        showTitleSkeleton={vm.operator.showTitleSkeleton}
        isRelayOperator={vm.operator.isRelayOperator}
        onOpenSettings={vm.openSettings}
      />

      {vm.channelsVisible && (
        <CreateGroupSection
          count={vm.groups.length}
          onCreated={vm.selectGroup}
        />
      )}

      <div
        // `pb-28`, not `pb-20`: the panel is `bottom-3` (12px) plus a pill
        // whose `min-h-[3.5rem]` is only a floor - `SidebarMe` stacks the
        // name over a truncated npub and puts a gear beside them, so the
        // real height overran the 80px reserved and the last channel
        // (`HACKATONS 2026` on La Crypta) scrolled in behind it.
        className={`flex-1 overflow-y-auto px-2 pb-2 ${vm.inVoice ? 'md:pb-52' : 'md:pb-28'}`}
        data-tour="channels-list"
      >
        {/* Relay/AUTH state lives in the unified bottom-right activity stack. */}
        {vm.groups.length === 0 && vm.channelsVisible && !vm.groupMetadataEose && (
          <Text as="div" variant="caption"
            className="px-2 py-3 flex items-center gap-2"
            data-testid="channels-loading">
            <div className="lc-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span>{t('shell.desktop.channels.loading')}</span>
          </Text>
        )}
        {vm.groups.length === 0 && vm.channelsVisible && vm.groupMetadataEose && (
          <Text as="div" variant="caption"
            className="px-2 py-3"
            data-testid="channels-empty">
            {t('shell.desktop.channels.empty')}
          </Text>
        )}
        <ChannelTree
          laidOut={vm.laidOut}
          groupsById={vm.groupsById}
          childrenByParent={vm.childrenByParent}
          view={view}
          onSelect={vm.selectGroup}
          distanceById={vm.groupDistanceById}
        />
      </div>
      <RelayAdminModals
        relay={relay}
        isRelayOperator={vm.operator.isRelayOperator}
        settingsOpen={vm.settingsOpen}
        onCloseSettings={vm.closeSettings}
        layout={vm.operator.layout}
        channels={vm.roots}
        branding={vm.operator.branding}
        emojiSet={vm.operator.emojiSet}
        relayRoles={vm.operator.relayRoles}
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
