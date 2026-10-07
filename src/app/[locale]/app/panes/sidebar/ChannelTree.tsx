'use client';

import { useTranslations } from 'next-intl';
import { categoryLabel } from '@/utils/relay/category-label';
import type { JsGroup } from '@/services/nostr-bridge';
import type { LaidOutSidebar } from '@/services/relay/channel-layout';
import type { View } from '@/utils/shell/desktop/view';
import { UNCATEGORIZED_ID } from '@/utils/shell/panes/sidebar/channel-tree';
import { useChannelTree } from '@/hooks/shell/panes/sidebar/useChannelTree';
import { CategorySection } from './CategorySection';
import { GroupNode } from './GroupNode';

type Props = {
  laidOut: LaidOutSidebar;
  groupsById: Readonly<Record<string, JsGroup>>;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  view: View;
  onSelect: (groupId: string) => void;
  distanceById: Readonly<Record<string, number | null>>;
};

/** The operator's categories with their channels, then whatever no category claims. */
export function ChannelTree({ laidOut, groupsById, childrenByParent, view, onSelect, distanceById }: Props) {
  const t = useTranslations();
  const vm = useChannelTree(laidOut, groupsById);
  const nodeProps = { depth: 0, childrenByParent, groupsById, view, onSelect, distanceById };
  return (
    <>
      {vm.categories.map((cat) => (
        <CategorySection
          key={cat.id}
          name={categoryLabel(cat.name, t)}
          collapsed={vm.isCollapsed(cat.id)}
          onToggle={() => vm.toggle(cat.id)}
          channelCount={cat.channelCount}
        >
          {cat.groups.map((g) => <GroupNode key={g.id} group={g} {...nodeProps} />)}
        </CategorySection>
      ))}
      {vm.uncategorizedCount > 0 && (
        vm.uncategorizedHeaded ? (
          <CategorySection
            name={t('shell.desktop.channels.uncategorized')}
            collapsed={vm.isCollapsed(UNCATEGORIZED_ID)}
            onToggle={() => vm.toggle(UNCATEGORIZED_ID)}
            channelCount={vm.uncategorizedCount}
          >
            {vm.uncategorized.map((g) => <GroupNode key={g.id} group={g} {...nodeProps} />)}
          </CategorySection>
        ) : (
          vm.uncategorized.map((g) => <GroupNode key={g.id} group={g} {...nodeProps} />)
        )
      )}
    </>
  );
}
