'use client';

import { useState } from 'react';
import type { JsGroup } from '@/services/nostr-bridge';
import type { LaidOutSidebar } from '@/services/channel-layout';
import type { View } from '../../view';
import { GroupNode } from '../GroupNode';

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapsed = (id: string) =>
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const node = (id: string) => {
    const g = groupsById[id];
    if (!g) return null;
    return (
      <GroupNode
        key={id}
        group={g}
        depth={0}
        childrenByParent={childrenByParent}
        groupsById={groupsById}
        view={view}
        onSelect={onSelect}
        distanceById={distanceById}
      />
    );
  };
  return (
    <>
      {laidOut.categories.map((cat) => (
        <CategorySection
          key={cat.id}
          name={cat.name}
          collapsed={!!collapsed[cat.id]}
          onToggle={() => toggleCollapsed(cat.id)}
          channelCount={cat.channelIds.length}
        >
          {cat.channelIds.map(node)}
        </CategorySection>
      ))}
      {laidOut.uncategorized.length > 0 && (
        laidOut.categories.length > 0 ? (
          <CategorySection
            name="Uncategorized"
            collapsed={!!collapsed['__uncat__']}
            onToggle={() => toggleCollapsed('__uncat__')}
            channelCount={laidOut.uncategorized.length}
          >
            {laidOut.uncategorized.map(node)}
          </CategorySection>
        ) : (
          laidOut.uncategorized.map(node)
        )
      )}
    </>
  );
}

function CategorySection({
  name,
  collapsed,
  onToggle,
  channelCount,
  children,
}: {
  name: string;
  collapsed: boolean;
  onToggle: () => void;
  channelCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted hover:text-lc-white"
      >
        <span className="inline-flex w-4 items-center justify-center">
          <svg
            className={`h-3 w-3 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px] font-normal opacity-60">{channelCount}</span>
      </button>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}
