'use client';

import Link from '@/components/ui/navigation/Link';

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import type { renderModeFor } from '@/services/social/kinds';
import { useNoteBody } from '@/hooks/social/note/useNoteBody';
import Card from '@/components/ui/layout/Card';
import TextButton from '@/components/ui/buttons/TextButton';
import NoteContent from './NoteContent';
import { ArticleCard } from '../article/ArticleCard';
import MediaCarousel from './MediaCarousel';
import NoteImetaMedia from './NoteImetaMedia';
import Text from '@/components/ui/layout/Text';

/** What a card shows under its header, per render mode (article, highlight, group, file, ...). */
export default function NoteBody({
  note,
  mode,
  imetaCount,
  onOpenProfile,
  onOpenNote,
  onOpenArticle,
  onOpenTag,
}: {
  note: NostrEvent;
  mode: ReturnType<typeof renderModeFor>;
  imetaCount: number;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onOpenArticle?: (note: NostrEvent) => void;
  onOpenTag?: (tag: string) => void;
}) {
  const t = useTranslations();
  const vm = useNoteBody({ note, mode });

  if (mode === 'article') {
    return <ArticleCard note={note} onOpen={() => onOpenArticle?.(note)} />;
  }

  if (mode === 'highlight') {
    // The content is SOMEONE ELSE'S words. Rendering it as the author's own
    // is the classic bug with kind 9802.
    const source = vm.highlightSource;
    return (
      <blockquote className="border-l-2 border-lc-green pl-3 text-[15px] italic leading-relaxed text-lc-white" data-testid="note-highlight">
        {note.content}
        {source && (
          <Link native href={source} target="_blank" rel="noreferrer noopener" className="mt-1 block text-[10px] not-italic text-lc-muted underline">
            {source}
          </Link>
        )}
      </blockquote>
    );
  }

  if (mode === 'group') {
    // A NIP-29 chat message. It's plain text like any note; what it needs
    // that a note doesn't is a way back to the room it was said in, since
    // the replies and the people are there rather than on the open network.
    return (
      <div data-testid="note-group-message">
        <div className="break-words text-[15px] leading-relaxed text-lc-white">
          <NoteContent content={note.content} noteId={note.id} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} onOpenTag={onOpenTag} />
        </div>
        {vm.groupHref && (
          <Link native
            href={vm.groupHref}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-lc-green hover:underline"
            data-testid="note-open-in-group"
          >
            {t('social.openInGroup')} →
          </Link>
        )}
      </div>
    );
  }

  if (mode === 'file') {
    // NIP-94: the file is in tags, the content is a description. Rendering
    // the content alone showed a caption with no file.
    return (
      <div data-testid="note-file">
        {vm.fileUrl && <MediaCarousel items={[{ url: vm.fileUrl, mimeType: vm.fileMimeType }]} />}
        {note.content.trim() && (
          <Text as="p" size="13" tone="muted" className="mt-2">{note.content}</Text>
        )}
      </div>
    );
  }

  if (mode === 'unsupported') {
    // Show the text anyway when there is some. A kind this client doesn't
    // model specially is usually still readable, and hiding the content
    // behind "can't display this" is worse than rendering it plainly.
    return (
      <Card data-testid="note-unsupported">
        {note.content.trim() ? (
          <div className="break-words text-[15px] leading-relaxed text-lc-white">
            <NoteContent content={note.content} noteId={note.id} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} onOpenTag={onOpenTag} />
          </div>
        ) : null}
        <Text as="p" size="11" tone="muted" className="mt-2">
          {`${t('social.unsupportedKind')} (kind ${note.kind})`}
        </Text>
      </Card>
    );
  }

  return (
    <div className="break-words text-[15px] leading-relaxed text-lc-white">
      <div className={`note-media ${vm.clamped ? 'note-clamp' : ''}`} data-testid={vm.clamped ? 'note-clamped' : undefined}>
        <NoteContent
          content={note.content}
          noteId={note.id}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
          onOpenTag={onOpenTag}
        />
        {/* Picture/video notes put the media in imeta; content is a caption. */}
        {(mode === 'picture' || mode === 'video') && imetaCount > 0 && (
          <NoteImetaMedia note={note} />
        )}
      </div>
      {vm.isLong && (
        <TextButton className="mt-1 text-[13px] font-semibold"
          onClick={vm.toggleExpanded}
          data-testid="note-show-more"
        >
          {t(vm.expanded ? 'social.showLess' : 'social.showMore')}
        </TextButton>
      )}
    </div>
  );
}

