'use client';

/**
 * Publications channel: a feed of child publications, each with its own chat.
 *
 * Naming note: the wire format still says "forum" everywhere: the
 * `["t","forum"]` channel marker, the `forum-tag` metadata tag, the
 * `channelKind === 'forum'` union member, and every identifier in this file.
 * Only the user-facing vocabulary is "publications"; nothing on the relay
 * changed.
 *
 * Each publication is itself a regular NIP-29 text channel, pinned to its
 * container by the `["parent", forumGroupId]` tag on its kind 9002 metadata.
 * Clicking one navigates the app to that child group, where the existing chat
 * panel takes over. Publications carry optional `["topic", id]` tags that
 * reference container-level tag definitions on its metadata
 * (`["forum-tag", id, name, emoji?, color?]`). The admin curates the tag set;
 * each tag's colour is either chosen there or derived from its id (see
 * `src/utils/forum-tag-colors.ts`).
 *
 * UX rule: only publications with at least one chat message are shown; empty /
 * aborted ones stay hidden until someone speaks. Both list and gallery views
 * observe this rule.
 *
 * The chrome is `forum/ForumChrome`, the cards and list states
 * `forum/ThreadCards`, the composer `forum/NewThreadModal`. This file keeps
 * the filtering, sorting and navigation.
 */
import { useMemo, useState } from 'react';
import {
  useChildrenByParent,
  useGroups,
  useGroupMetadataEose,
  useMessagesByGroup,
} from '@/services/nostr-bridge';
import type { JsGroup, JsForumTag, JsMessage } from '@/services/nostr-bridge';
import { useForumPrefs } from '@/hooks/chat/useForumPrefs';
import { ForumChrome } from './forum/ForumChrome';
import { NewThreadModal } from './forum/NewThreadModal';
import {
  EmptyForum,
  LoadingThreads,
  NoMatchingThreads,
  ThreadCard,
  ThreadGallery,
} from './forum/ThreadCards';

interface Props {
  groupId: string;
  channelName?: string;
  /** Open a publication (child group) as the active view in the host shell. */
  onSelectThread: (childGroupId: string) => void;
}

/** One shared empty list, so a forum with no threads keeps a stable identity. */
const NO_CHILDREN: ReadonlyArray<string> = [];

export default function ForumView({ groupId, channelName, onSelectThread }: Props) {
  void channelName; // title is rendered by the host chat header; no duplicate here
  const childrenByParent = useChildrenByParent();
  const groups = useGroups();
  const groupMetadataEose = useGroupMetadataEose();
  const messagesByGroup = useMessagesByGroup();
  const childIds = childrenByParent[groupId] ?? NO_CHILDREN;
  const forum = useMemo(() => groups.find((g) => g.id === groupId) ?? null, [groups, groupId]);
  const forumTags: ReadonlyArray<JsForumTag> = forum?.forumTags ?? [];
  const childGroups = useMemo<JsGroup[]>(() => {
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    return childIds.map((id) => byId.get(id)).filter(Boolean) as JsGroup[];
  }, [childIds, groups]);

  // Shared with the phone ForumScreen: one storage key for both shells
  // (see src/services/forum-prefs.ts).
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

  // Derive per-thread "first message" + "last message" so we can sort by
  // recent activity vs creation date and surface the OP excerpt in cards.
  // Threads with zero messages have no first/last and get hidden by the
  // ThreadCard / ThreadGalleryCard themselves (per the forum UX rule).
  const threadActivity = useMemo(() => {
    const map = new Map<string, { first: JsMessage | null; last: JsMessage | null }>();
    for (const t of childGroups) {
      const msgs = messagesByGroup[t.id] ?? [];
      const first = msgs[0] ?? null;
      const last = msgs[msgs.length - 1] ?? null;
      map.set(t.id, { first, last });
    }
    return map;
  }, [childGroups, messagesByGroup]);

  const visibleThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = childGroups.filter((t) => {
      if (q && !(t.name ?? '').toLowerCase().includes(q)) return false;
      if (selectedTagIds.length > 0) {
        const threadTagSet = new Set(t.topics);
        if (prefs.tagMatch === 'all') {
          for (const id of selectedTagIds) if (!threadTagSet.has(id)) return false;
        } else {
          if (!selectedTagIds.some((id) => threadTagSet.has(id))) return false;
        }
      }
      return true;
    });
    filtered.sort((a, b) => {
      const aA = threadActivity.get(a.id);
      const bA = threadActivity.get(b.id);
      const aT = prefs.sortBy === 'recent' ? aA?.last?.createdAt ?? 0 : aA?.first?.createdAt ?? 0;
      const bT = prefs.sortBy === 'recent' ? bA?.last?.createdAt ?? 0 : bA?.first?.createdAt ?? 0;
      return bT - aT;
    });
    return filtered;
  }, [childGroups, searchQuery, selectedTagIds, prefs.tagMatch, prefs.sortBy, threadActivity]);

  // "Loading publications…" until the relay has finished its kind 39000 stream.
  // Without this gate the EmptyForum CTA shows instantly even though child
  // groups are still on the wire, which read as "none exist" when
  // really they just hadn't ingested yet.
  const threadsLoading = childGroups.length === 0 && !groupMetadataEose;

  // If the search query has no exact-name match, the bar's submit action
  // opens the new-thread modal prefilled with the typed text.
  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return childGroups.some((t) => (t.name ?? '').toLowerCase() === q);
  }, [childGroups, searchQuery]);

  const openNewThread = (initialTitle = '') => {
    setPrefillTitle(initialTitle);
    setShowNewThread(true);
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <ForumChrome
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        exactMatch={exactMatch}
        onSubmitSearch={() => {
          const q = searchQuery.trim();
          if (!q) return;
          if (!exactMatch) { openNewThread(q); return; }
          // Exact title match: Enter should open that thread. It used to do
          // nothing at all, which read as a dead key.
          const match = childGroups.find((c) => (c.name ?? '').toLowerCase() === q.toLowerCase());
          if (match) onSelectThread(match.id);
        }}
        onClickNewThread={() => openNewThread('')}
        prefs={prefs}
        onPrefsChange={updatePrefs}
        forumTags={forumTags}
        selectedTagIds={selectedTagIds}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTagIds([])}
      />
      <div className="flex-1 overflow-y-auto p-3">
        {threadsLoading ? (
          <LoadingThreads />
        ) : visibleThreads.length === 0 && childGroups.length === 0 ? (
          <EmptyForum onNewThread={() => openNewThread('')} />
        ) : visibleThreads.length === 0 ? (
          <NoMatchingThreads
            query={searchQuery.trim()}
            hasTagFilter={selectedTagIds.length > 0}
            onCreate={() => openNewThread(searchQuery.trim())}
          />
        ) : prefs.viewMode === 'gallery' ? (
          <ThreadGallery
            threads={visibleThreads}
            forumTags={forumTags}
            onSelectThread={onSelectThread}
          />
        ) : (
          <div className="space-y-2">
            {visibleThreads.map((g) => (
              <ThreadCard
                key={g.id}
                thread={g}
                forumTags={forumTags}
                onOpen={() => onSelectThread(g.id)}
              />
            ))}
          </div>
        )}
      </div>
      {showNewThread && (
        <NewThreadModal
          forumGroupId={groupId}
          forumTags={forumTags}
          initialTitle={prefillTitle}
          isPublic={forum?.isPublic ?? true}
          isHidden={forum?.isHidden ?? false}
          isRestricted={forum?.isRestricted ?? false}
          isOpen={forum?.isOpen ?? true}
          onClose={() => setShowNewThread(false)}
          onCreated={(childId) => {
            setShowNewThread(false);
            setSearchQuery('');
            onSelectThread(childId);
          }}
        />
      )}
    </div>
  );
}
