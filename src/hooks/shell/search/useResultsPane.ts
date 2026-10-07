'use client';

import { useMemo } from 'react';
import type { JsGroup, JsSearchHit } from '@/services/nostr-bridge';
import { groupNamesById, showsEntitySections } from '@/utils/shell/desktop/search-results';

/**
 * The typed-query dropdown: whether the people and channel sections show,
 * and each message hit's channel name from one lookup for the whole pane
 * (this used to be a `useGroups()` call inside every result row).
 */
export function useResultsPane(raw: string, hasStructuredTokens: boolean, groups: ReadonlyArray<JsGroup>) {
  const names = useMemo(() => groupNamesById(groups), [groups]);
  return {
    showEntities: showsEntitySections(raw, hasStructuredTokens),
    groupNameFor: (m: JsSearchHit) => (m.groupId ? names.get(m.groupId) ?? null : null),
  };
}
