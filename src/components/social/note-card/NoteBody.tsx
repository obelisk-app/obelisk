'use client';

import { useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { parseImeta } from '@/services/social/imeta';
import type { renderModeFor } from '@/services/social/kinds';
import { groupNoteUrl } from '@/services/social/note-links';
import Card from '@/components/ui/Card';
import NoteContent from '../NoteContent';
import { ArticleCard } from '../ArticleCard';
import MediaCarousel from '../MediaCarousel';
import { LONG_NOTE_CHARS } from './helpers';
import TextButton from '@/components/ui/TextButton';

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
  const { t } = useTranslation();
  const activeRelay = useCurrentRelayUrl();
  const [expanded, setExpanded] = useState(false);
  const groupHref = mode === 'group' ? groupNoteUrl(note, activeRelay) : null;

  if (mode === 'article') {
    return <ArticleCard note={note} onOpen={() => onOpenArticle?.(note)} />;
  }

  if (mode === 'highlight') {
    // The content is SOMEONE ELSE'S words. Rendering it as the author's own
    // is the classic bug with kind 9802.
    const source = note.tags.find((tag) => tag[0] === 'r')?.[1];
    return (
      <blockquote className="border-l-2 border-lc-green pl-3 text-[15px] italic leading-relaxed text-lc-white" data-testid="note-highlight">
        {note.content}
        {source && (
          <a href={source} target="_blank" rel="noreferrer noopener" className="mt-1 block text-[10px] not-italic text-lc-muted underline">
            {source}
          </a>
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
        {groupHref && (
          <a
            href={groupHref}
            className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-lc-green hover:underline"
            data-testid="note-open-in-group"
          >
            {t('social.openInGroup')} →
          </a>
        )}
      </div>
    );
  }

  if (mode === 'file') {
    // NIP-94: the file is in tags, the content is a description. Rendering
    // the content alone showed a caption with no file.
    const url = note.tags.find((tag) => tag[0] === 'url')?.[1];
    const mimeType = note.tags.find((tag) => tag[0] === 'm')?.[1] ?? null;
    return (
      <div data-testid="note-file">
        {url && <MediaCarousel items={[{ url, mimeType }]} />}
        {note.content.trim() && (
          <p className="mt-2 text-[13px] text-lc-muted">{note.content}</p>
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
        <p className="mt-2 text-[11px] text-lc-muted">
          {`${t('social.unsupportedKind')} (kind ${note.kind})`}
        </p>
      </Card>
    );
  }

  // A long note shouldn't push the next ten posts off the screen. The
  // threshold is on raw length rather than measured height so the decision is
  // stable across reflows and doesn't need a layout pass.
  const isLong = note.content.length > LONG_NOTE_CHARS;
  const clamped = isLong && !expanded;

  return (
    <div className="break-words text-[15px] leading-relaxed text-lc-white">
      <div className={`note-media ${clamped ? 'note-clamp' : ''}`} data-testid={clamped ? 'note-clamped' : undefined}>
        <NoteContent
          content={note.content}
          noteId={note.id}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
          onOpenTag={onOpenTag}
        />
        {/* Picture/video notes put the media in imeta; content is a caption. */}
        {(mode === 'picture' || mode === 'video') && imetaCount > 0 && (
          <ImetaMedia note={note} />
        )}
      </div>
      {isLong && (
        <TextButton className="mt-1 text-[13px] font-semibold"
          onClick={() => setExpanded((value) => !value)}
          data-testid="note-show-more"
        >
          {t(expanded ? 'social.showLess' : 'social.showMore')}
        </TextButton>
      )}
    </div>
  );
}

function ImetaMedia({ note }: { note: NostrEvent }) {
  const media = useMemo(() => [...parseImeta(note).values()], [note]);
  // A set is a carousel, not a stack: four images stacked meant the note
  // owned the viewport and everything after it was a scroll away.
  return (
    <div className="mt-2" data-testid="note-imeta-media">
      <MediaCarousel items={media} />
    </div>
  );
}
