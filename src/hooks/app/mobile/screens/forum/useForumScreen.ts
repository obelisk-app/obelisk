'use client';

import { useMemo, useState } from 'react';
import {
  useChildrenByParent,
  useGroupMetadataEose,
  useGroups,
  useMessagesByGroup,
  type JsForumTag,
  type JsGroup,
} from '@/services/nostr-bridge';
import { useForumPrefs } from '@/hooks/chat/useForumPrefs';
import { hasExactThreadMatch, visibleForumThreads } from '@/app/app/mobile/screens/forum/forum-threads';

/** One shared empty list, so a forum with no threads keeps a stable identity. */
const NO_CHILDREN: ReadonlyArray<string> = [];

/** The phone forum's data and filters: its threads, search, tag chips, sort and the two sheets. */
export function useForumScreen(groupId: string) {
  const groups = useGroups();
  const childrenByParent = useChildrenByParent();
  const groupMetadataEose = useGroupMetadataEose();
  const messagesByGroup = useMessagesByGroup();
  const group = groups.find((g) => g.id === groupId);
  const forumTags: ReadonlyArray<JsForumTag> = group?.forumTags ?? [];
  const childIds = childrenByParent[groupId] ?? NO_CHILDREN;
  const children = useMemo<JsGroup[]>(() => {
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    return childIds.map((id) => byId.get(id)).filter(Boolean) as JsGroup[];
  }, [childIds, groups]);

  // Shared with the desktop ForumView: same storage key, so the sort choice
  // survives crossing the breakpoint (see src/services/forum-prefs.ts).
  const { prefs, update: updatePrefs } = useForumPrefs(groupId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlyArray<string>>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState('');

  // Reset search + tag filters when the user navigates to a different
  // forum, in the same render rather than one commit after it.
  const [filtersForum, setFiltersForum] = useState(groupId);
  if (filtersForum !== groupId) {
    setFiltersForum(groupId);
    setSearchQuery('');
    setSelectedTagIds([]);
  }

  const exactMatch = useMemo(() => hasExactThreadMatch(children, searchQuery), [children, searchQuery]);
  const visibleThreads = useMemo(
    () => visibleForumThreads(children, searchQuery, selectedTagIds, prefs, messagesByGroup),
    [children, searchQuery, selectedTagIds, prefs, messagesByGroup],
  );

  return {
    group,
    forumTags,
    children,
    visibleThreads,
    threadsLoading: children.length === 0 && !groupMetadataEose,
    prefs,
    updatePrefs,
    searchQuery,
    setSearchQuery,
    selectedTagIds,
    clearTags: () => setSelectedTagIds([]),
    toggleTag: (id: string) => {
      setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    canCreateFromSearch: !exactMatch && searchQuery.trim().length > 0,
    showNewThread,
    closeNewThread: () => setShowNewThread(false),
    prefillTitle,
    openNewThread: (initial = '') => {
      setPrefillTitle(initial);
      setShowNewThread(true);
    },
    showSort,
    setShowSort,
  };
}

export type ForumScreenState = ReturnType<typeof useForumScreen>;
