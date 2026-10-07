'use client';

import { useMemo, useState } from 'react';
import {
  useChildrenByParent,
  useGroupMetadataEose,
  useGroups,
  useMessagesByGroup,
  type JsForumTag,
} from '@/services/nostr-bridge';
import { useForumPrefs } from '@/hooks/chat/forum/useForumPrefs';
import { hasExactThreadMatch, visibleForumThreads } from '@/utils/chat/forum/forum-threads';
import {
  forumAccessFlags,
  forumListState,
  forumSearchSubmit,
  resolveChildGroups,
  toggleTagId,
} from '@/utils/chat/forum/forum-view';

/** One shared empty list, so a forum with no threads keeps a stable identity. */
const NO_CHILDREN: ReadonlyArray<string> = [];

/**
 * The desktop Publications list's view model: the child publications, the
 * search and tag filters, the shared sort / view / tag-match prefs, which
 * body to show and the new-publication composer. `ForumView` only renders
 * what this returns (docs/conventions.md#component-files).
 */
export function useForumView(groupId: string, onSelectThread: (childGroupId: string) => void) {
  const childrenByParent = useChildrenByParent();
  const groups = useGroups();
  const groupMetadataEose = useGroupMetadataEose();
  const messagesByGroup = useMessagesByGroup();
  const childIds = childrenByParent[groupId] ?? NO_CHILDREN;
  const forum = useMemo(() => groups.find((g) => g.id === groupId) ?? null, [groups, groupId]);
  const forumTags: ReadonlyArray<JsForumTag> = forum?.forumTags ?? [];
  const childGroups = useMemo(() => resolveChildGroups(childIds, groups), [childIds, groups]);

  // Shared with the phone ForumScreen: one storage key for both shells
  // (see src/services/chat/forum/forum-prefs.ts).
  const { prefs, update: updatePrefs } = useForumPrefs(groupId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlyArray<string>>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState('');

  // Reset search + tag filters when the user navigates to a different
  // forum, in the same render rather than one commit after it.
  const [filtersForum, setFiltersForum] = useState(groupId);
  if (filtersForum !== groupId) {
    setFiltersForum(groupId);
    setSearchQuery('');
    setSelectedTagIds([]);
  }

  const visibleThreads = useMemo(
    () => visibleForumThreads(childGroups, searchQuery, selectedTagIds, prefs, messagesByGroup),
    [childGroups, searchQuery, selectedTagIds, prefs, messagesByGroup],
  );
  // With no exact-name match, the bar's submit opens the composer prefilled.
  const exactMatch = useMemo(() => hasExactThreadMatch(childGroups, searchQuery), [childGroups, searchQuery]);

  const openNewThread = (initialTitle: string) => {
    setPrefillTitle(initialTitle);
    setShowNewThread(true);
  };

  const submitSearch = () => {
    const action = forumSearchSubmit(childGroups, searchQuery);
    // An exact title match opens that publication; it used to do nothing
    // at all, which read as a dead key.
    if (action.kind === 'open') onSelectThread(action.id);
    if (action.kind === 'create') openNewThread(action.title);
  };

  return {
    forumTags,
    access: forumAccessFlags(forum),
    visibleThreads,
    listState: forumListState({
      childCount: childGroups.length,
      visibleCount: visibleThreads.length,
      metadataEose: groupMetadataEose,
      viewMode: prefs.viewMode,
    }),
    prefs,
    updatePrefs,
    search: {
      query: searchQuery,
      trimmed: searchQuery.trim(),
      setQuery: setSearchQuery,
      exactMatch,
      submit: submitSearch,
    },
    tags: {
      selected: selectedTagIds,
      hasFilter: selectedTagIds.length > 0,
      toggle: (id: string) => setSelectedTagIds((prev) => toggleTagId(prev, id)),
      clear: () => setSelectedTagIds([]),
    },
    composer: {
      open: showNewThread,
      prefillTitle,
      /** Takes no arguments, so it can be handed straight to an onClick. */
      openBlank: () => openNewThread(''),
      openFromSearch: () => openNewThread(searchQuery.trim()),
      close: () => setShowNewThread(false),
      created: (childId: string) => {
        setShowNewThread(false);
        setSearchQuery('');
        onSelectThread(childId);
      },
    },
  };
}

export type ForumViewModel = ReturnType<typeof useForumView>;
