'use client';

import { useMemo, useState } from 'react';
import type { JsGroup } from '@/services/nostr-bridge';
import type { LaidOutSidebar } from '@/services/relay/channel-layout';
import { channelTreeSections } from '@/utils/shell/panes/sidebar/channel-tree';

/** The channel tree's view model: its sections and which of them are folded (for this visit). */
export function useChannelTree(laidOut: LaidOutSidebar, groupsById: Readonly<Record<string, JsGroup>>) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => channelTreeSections(laidOut, groupsById), [laidOut, groupsById]);
  return {
    ...sections,
    isCollapsed: (id: string) => !!collapsed[id],
    toggle: (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] })),
  };
}
