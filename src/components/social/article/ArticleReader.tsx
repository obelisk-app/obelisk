'use client';

/**
 * The full NIP-23 reader, used by the thread pane, the article modal, the
 * note viewer and the profile. The feed's compact card is `ArticleCard.tsx`;
 * both read the same tag helpers (`src/utils/social/article-meta.ts`) so
 * they can't disagree about which title an article has.
 */

import Button from '@/components/ui/buttons/Button';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/data/Badge';
import Chip from '@/components/ui/data/Chip';
import RemoteImage from '@/components/ui/media/RemoteImage';
import UserAvatar from '@/components/ui/media/UserAvatar';
import MessageContent from '@/components/chat/message/MessageContent';
import { useArticleReader } from '@/hooks/social/article/useArticleReader';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/** Full reader: used by the thread pane and the article modal. */
export default function ArticleReader({
  note,
  onOpenProfile,
}: {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const { meta, minutes, author, name, published, showHighlights, toggleHighlights, highlightCount, bodyRef } = useArticleReader(note);

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-6" data-testid="article-reader">
      {meta.image && (
        <RemoteImage
          src={meta.image}
          alt=""
          decoding="async"
          className="mb-6 max-h-72 w-full rounded-2xl object-cover"
        />
      )}

      <Heading as="h1" className="text-balance text-2xl font-extrabold leading-tight text-lc-white md:text-3xl">
        {meta.title || t('social.untitledArticle')}
      </Heading>

      {meta.summary && (
        <Text as="p" variant="muted" className="mt-3 leading-relaxed">{meta.summary}</Text>
      )}

      <div className="mt-5 flex items-center gap-3 border-y border-lc-border py-3">
        <Button
          variant="bare"
          type="button"
          onClick={() => onOpenProfile?.(note.pubkey)}
          className="flex items-center gap-2 text-left"
        >
          <UserAvatar pubkey={note.pubkey} picture={author?.picture} size={9} name={name} alt="" />
          <span className="text-sm font-medium text-lc-white hover:underline">{name}</span>
        </Button>
        <span className="ml-auto text-[11px] text-lc-muted">
          {published}
          {' · '}
          {t('social.minReadCount', { minutes })}
        </span>
        {/*
          Highlights belong here rather than in the feed: as feed rows they
          read as strangers posting paragraphs they didn't write, and a
          popular article produces dozens of overlapping ones.
        */}
        <Chip
          size="11"
          onClick={toggleHighlights}
          state={showHighlights ? 'selected' : 'idle'}
          className="shrink-0 font-medium"
          data-testid="article-highlights-toggle"
        >
          {t('social.highlights')}
          {highlightCount !== null && ` · ${highlightCount}`}
        </Chip>
      </div>

      {/*
        `prose-*` utilities aren't available here, so the typography comes
        from `.article-body` in globals.css: headings, lists, quotes and
        code sized for reading rather than for a chat bubble.
      */}
      <div ref={bodyRef} className="article-body note-media mt-6 text-[15px] leading-7 text-lc-white">
        <MessageContent content={note.content} messageId={note.id} wideMedia />
      </div>

      {meta.hashtags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5 border-t border-lc-border pt-4">
          {meta.hashtags.map((tag) => (
            <Badge key={tag} tone="muted">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}
