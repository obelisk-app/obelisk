'use client';

import Text from '@/components/ui/layout/Text';
import { useTranslations } from 'next-intl';
import type { View } from '@/utils/shell/desktop/view';
import { CreateGroupSection } from './CreateGroupSection';
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
        // `FloatingUserPanel` floats over the foot of this list. It publishes
        // how much it covers (its height, a call bar included, plus its 12px
        // offset) as `--floating-user-panel-clearance`; the list pads by that
        // plus a gap, so its last channel scrolls fully clear of the panel.
        // 7rem is the fallback before the first measure.
        className="flex-1 overflow-y-auto px-2 pb-2 md:pb-[calc(var(--floating-user-panel-clearance,7rem)+0.5rem)]"
        data-testid="channels-scroll"
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
    </>
  );
}
