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
 * `src/utils/chat/forum/forum-tag-colors.ts`).
 *
 * UX rule: only publications with at least one chat message are shown; empty /
 * aborted ones stay hidden until someone speaks. Both list and gallery views
 * observe this rule.
 *
 * The chrome is `forum/ForumChrome`, the cards and list states
 * `forum/ThreadCards`, the composer `forum/NewThreadModal`. This file keeps
 * only the markup; the filtering, sorting and navigation are its view model,
 * `src/hooks/chat/forum/useForumView.ts`.
 */
import { useForumView } from '@/hooks/chat/forum/useForumView';
import { ForumChrome } from './ForumChrome';
import { NewThreadModal } from './NewThreadModal';
import {
  EmptyForum,
  LoadingThreads,
  NoMatchingThreads,
  ThreadCard,
  ThreadGallery,
} from './ThreadCards';

interface Props {
  groupId: string;
  /** Not shown: the host chat header renders the title, so there is no duplicate here. */
  channelName?: string;
  /** Open a publication (child group) as the active view in the host shell. */
  onSelectThread: (childGroupId: string) => void;
}

export default function ForumView({ groupId, onSelectThread }: Props) {
  const vm = useForumView(groupId, onSelectThread);
  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <ForumChrome
        searchQuery={vm.search.query}
        onSearchChange={vm.search.setQuery}
        exactMatch={vm.search.exactMatch}
        onSubmitSearch={vm.search.submit}
        onClickNewThread={vm.composer.openBlank}
        prefs={vm.prefs}
        onPrefsChange={vm.updatePrefs}
        forumTags={vm.forumTags}
        selectedTagIds={vm.tags.selected}
        onToggleTag={vm.tags.toggle}
        onClearTags={vm.tags.clear}
      />
      <div className="flex-1 overflow-y-auto p-3">
        {vm.listState === 'loading' ? (
          <LoadingThreads />
        ) : vm.listState === 'empty' ? (
          <EmptyForum onNewThread={vm.composer.openBlank} />
        ) : vm.listState === 'no-match' ? (
          <NoMatchingThreads
            query={vm.search.trimmed}
            hasTagFilter={vm.tags.hasFilter}
            onCreate={vm.composer.openFromSearch}
          />
        ) : vm.listState === 'gallery' ? (
          <ThreadGallery
            threads={vm.visibleThreads}
            forumTags={vm.forumTags}
            onSelectThread={onSelectThread}
          />
        ) : (
          <div className="space-y-2">
            {vm.visibleThreads.map((g) => (
              <ThreadCard
                key={g.id}
                thread={g}
                forumTags={vm.forumTags}
                onOpen={() => onSelectThread(g.id)}
              />
            ))}
          </div>
        )}
      </div>
      {vm.composer.open && (
        <NewThreadModal
          forumGroupId={groupId}
          forumTags={vm.forumTags}
          initialTitle={vm.composer.prefillTitle}
          isPublic={vm.access.isPublic}
          isHidden={vm.access.isHidden}
          isRestricted={vm.access.isRestricted}
          isOpen={vm.access.isOpen}
          onClose={vm.composer.close}
          onCreated={vm.composer.created}
        />
      )}
    </div>
  );
}
