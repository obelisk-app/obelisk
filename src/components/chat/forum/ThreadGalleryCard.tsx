'use client';

import Stack from '@/components/ui/layout/Stack';
import Button from '@/components/ui/buttons/Button';
import type { JsForumTag, JsGroup } from '@/services/nostr-bridge';
import { useLocale, useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { InlineTagChip } from './InlineTagChip';
import { ThreadGalleryCardSkeleton } from './ThreadGalleryCardSkeleton';
import { posterName } from '@/utils/chat/forum/forum-threads';
import { relativeTime } from '@/utils/format/relative-time';
import { useThreadCardData } from '@/hooks/chat/forum/useThreadCardData';

/**
 * Gallery card: larger, hero-image-style layout. Uses the thread's banner /
 * picture if present, falling back to the OP avatar. Same three states as
 * the list card.
 */
export function ThreadGalleryCard({
  thread,
  forumTags,
  onOpen,
}: {
  thread: JsGroup;
  forumTags: ReadonlyArray<JsForumTag>;
  onOpen: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { messages, messagesStatus, op, lastMsg, opMeta, tags } = useThreadCardData(thread, forumTags);
  if (!op || !lastMsg) {
    if (messagesStatus === 'empty-confirmed') return null;
    return <ThreadGalleryCardSkeleton thread={thread} onOpen={onOpen} />;
  }
  const opName = posterName(opMeta, op.pubkey);
  const heroUrl = thread.banner || thread.picture || opMeta?.picture || null;
  return (
    <Button
      variant="bare"
      type="button"
      onClick={onOpen}
      className="lc-card flex flex-col text-left overflow-hidden hover:border-lc-green/40 transition-colors"
      data-testid="thread-gallery-card"
      data-thread-id={thread.id}
    >
      <div className="h-28 w-full bg-lc-black border-b border-lc-border overflow-hidden relative">
        {heroUrl ? (
          <RemoteImage src={heroUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lc-muted text-2xl">
            #
          </div>
        )}
        {tags.length > 0 && (
          <div className="absolute left-2 bottom-2 flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
            {tags.slice(0, 3).map((tag) => (
              <InlineTagChip key={tag.id} tag={tag} />
            ))}
            {tags.length > 3 && (
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-lc-white/90">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <Stack gap="1.5" className="p-3 flex-1">
        <div className="text-sm font-semibold text-lc-white truncate">
          {thread.name || t('chat.forum.untitled')}
        </div>
        <div className="text-xs text-lc-muted line-clamp-3 break-words">{op.content}</div>
        <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-lc-muted pt-1">
          <span className="truncate">{t('chat.forum.op', { name: opName })}</span>
          <span className="shrink-0">
            {t('chat.forum.messages', { count: messages.length })} · {relativeTime(lastMsg.createdAt, t, locale)}
          </span>
        </div>
      </Stack>
    </Button>
  );
}
