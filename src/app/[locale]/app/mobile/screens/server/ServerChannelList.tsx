'use client';

import { useTranslations } from 'next-intl';
import { categoryLabel } from '@/utils/relay/category-label';
import type { ServerScreenModel } from '@/hooks/shell/mobile/screens/server/useServerScreen';
import { ChannelCategorySection } from './ChannelCategorySection';
import { ServerChannelEntry } from './ServerChannelEntry';
import { ChannelListEmptyState } from './ChannelListEmptyState';

/** The server screen's channels: one section per operator category, then the rest, or the empty state. */
export function ServerChannelList({ vm }: { vm: Omit<ServerScreenModel, 'channelListRef'> }) {
  const t = useTranslations();
  return (
    <>
      {vm.laidOut.categories.map((cat) => (
        <ChannelCategorySection
          key={cat.id}
          catId={cat.id}
          label={`${categoryLabel(cat.name, t)} · ${vm.channelsIn(cat.channelIds).length}`}
          collapsed={vm.isCollapsed(cat.id)}
          onToggle={() => vm.toggleCategory(cat.id)}
        >
          {vm.channelsIn(cat.channelIds).map((g) => (
            <ServerChannelEntry key={g.id} group={g} {...vm.entryFor(g)} onOpen={vm.openChannel} />
          ))}
          {vm.channelsIn(cat.channelIds).length === 0 && <div className="cat-empty">{t('mobile.channels.empty')}</div>}
        </ChannelCategorySection>
      ))}
      {vm.laidOut.uncategorized.length > 0 && (
        <ChannelCategorySection
          catId="__other"
          label={t('mobile.layout.uncategorizedCount', { count: vm.laidOut.uncategorized.length })}
          collapsed={vm.isCollapsed('__other')}
          onToggle={() => vm.toggleCategory('__other')}
          showHeader={vm.laidOut.categories.length > 0}
        >
          {vm.channelsIn(vm.laidOut.uncategorized).map((g) => (
            <ServerChannelEntry key={g.id} group={g} {...vm.entryFor(g)} onOpen={vm.openChannel} />
          ))}
        </ChannelCategorySection>
      )}
      {vm.roots.length === 0 && (
        <ChannelListEmptyState
          relayAccess={vm.relayAccess}
          connectionState={vm.connectionState}
          metadataEose={vm.metadataEose}
        />
      )}
    </>
  );
}
