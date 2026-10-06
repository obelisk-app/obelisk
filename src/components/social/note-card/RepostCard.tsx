'use client';

/**
 * A kind 6 / kind 16 row: "Alice, Bob and 6 others reposted" over the note
 * they reposted.
 *
 * The embedded note is only rendered after `embeddedRepostEvent` has checked
 * its signature and its id against the wrapper's `e` tag. Anything else
 * (an empty repost, or a forged blob) gets a button that opens the real
 * note by id instead.
 */

import { useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import { embeddedRepostEvent, repostTarget } from '@/services/social/repost';
import { RepostIcon } from '../NoteActions';
import PlainNoteCard from './PlainNoteCard';
import { bodyClickHandler } from '@/utils/social/note-card';
import type { NoteCardProps } from '../NoteCard';
import TextButton from '@/components/ui/TextButton';

export default function RepostCard(props: NoteCardProps) {
  const { t } = useTranslation();
  const { note, reposters } = props;
  // `embeddedRepostEvent` only returns a note whose signature verifies and
  // whose id matches the wrapper's `e` tag; the pool never saw the inner
  // event, so this is where it gets checked. A forged blob comes back null
  // and the row falls through to the e-tag button below, which opens the
  // real note by id. Memoised per card on top of the module-level memo in
  // `repost.ts`, so a feed re-render costs no schnorr verification.
  const inner = useMemo(() => embeddedRepostEvent(note), [note]);
  const target = useMemo(() => repostTarget(note), [note]);

  // The row's own author first, then anyone else who reposted the same note.
  const everyone = useMemo(() => {
    const list = [note.pubkey, ...(reposters ?? [])];
    return [...new Set(list)];
  }, [note.pubkey, reposters]);

  // The reposted note is the content of this row, so the row opens it. The
  // inner card renders with `nested` and has no handler of its own, so this
  // is the single owner of a body click, and `bodyClickHandler` steps aside
  // for the real controls inside, including the inner timestamp button.
  const openReposted = bodyClickHandler(
    props.onOpenNote && (inner || target)
      ? () => props.onOpenNote?.((inner ?? target!).id)
      : undefined,
  );

  return (
    <article
      className={`note-card px-5 py-4${openReposted ? ' note-card-open' : ''}`}
      onClick={openReposted}
      data-testid="repost-card"
    >
      {/*
        The attribution was 11px muted text with a `⇄` glyph: small enough to
        miss, and the glyph rendered at a different weight than the SVG icons
        beside it. It's the first thing you need to understand the row, so it
        reads as a line of text now, with the names emphasised.
      */}
      <div
        className="mb-2 flex items-center gap-2 text-[13px] text-lc-muted"
        data-testid="repost-attribution"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-lc-green">
          <RepostIcon />
        </span>
        <span className="min-w-0 truncate">
          <RepostersLine pubkeys={everyone} onOpenProfile={props.onOpenProfile} />
          {' '}
          {t('social.reposted')}
        </span>
      </div>
      {inner ? (
        // `nested` (not `quoted`): the original keeps its full action row, so
        // replying or liking from a repost targets the note that was
        // reposted, which is what the reader means by those buttons.
        <PlainNoteCard {...props} note={inner} nested />
      ) : (
        // Empty-content repost, or an embed that failed verification: the
        // target has to be fetched. Rather than block the row, link out to
        // what we know; the thread view fetches by id through the pool,
        // which verifies it.
        <button
          type="button"
          className="w-full rounded-xl border border-lc-border bg-lc-dark p-3 text-left text-xs text-lc-muted"
          onClick={() => target && props.onOpenNote?.(target.id)}
        >
          {t('social.openRepostedNote')}
        </button>
      )}
    </article>
  );
}

/**
 * "Alice, Bob and 6 others".
 *
 * Two names then a count: three is already too wide for a feed row, and the
 * number is what tells you how much reach the note actually got.
 */
function RepostersLine({
  pubkeys,
  onOpenProfile,
}: {
  pubkeys: readonly string[];
  onOpenProfile?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  const shown = pubkeys.slice(0, 2);
  const rest = pubkeys.length - shown.length;

  return (
    <>
      {shown.map((pubkey, index) => (
        <span key={pubkey}>
          {index > 0 && <span>, </span>}
          <ReposterName pubkey={pubkey} onOpenProfile={onOpenProfile} />
        </span>
      ))}
      {rest > 0 && (
        <span data-testid="repost-others">
          {' '}
          {t('social.andOthers').replace('{n}', String(rest))}
        </span>
      )}
    </>
  );
}

function ReposterName({
  pubkey,
  onOpenProfile,
}: {
  pubkey: string;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const author = useAuthor(pubkey);
  const name = displayNameFor(pubkey, author);
  return (
    <TextButton tone="plain" className="font-semibold text-lc-white"
      onClick={() => onOpenProfile?.(pubkey)}
    >
      {name}
    </TextButton>
  );
}
