'use client';

import type { JsForumTag, JsGroup } from '@/services/nostr-bridge';
import { ThreadGalleryCard } from './ThreadGalleryCard';

export function ThreadGallery({
  threads,
  forumTags,
  onSelectThread,
}: {
  threads: ReadonlyArray<JsGroup>;
  forumTags: ReadonlyArray<JsForumTag>;
  onSelectThread: (id: string) => void;
}) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="forum-gallery"
    >
      {threads.map((g) => (
        <ThreadGalleryCard
          key={g.id}
          thread={g}
          forumTags={forumTags}
          onOpen={() => onSelectThread(g.id)}
        />
      ))}
    </div>
  );
}
