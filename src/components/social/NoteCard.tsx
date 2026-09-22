'use client';

/**
 * One row in a feed.
 *
 * Replaces the two-button row in the old `ProfileNote` (reply + a
 * fire-and-forget heart with no count). This carries the full action set —
 * reply, repost, quote, react, zap — each with the live count from
 * `fetchEngagement`, plus the rendering modes a feed needs so posts from
 * Amethyst and Primal don't show up as "unsupported".
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { hexToNpub } from '@nostr-wot/data';
import { useCurrentRelayUrl, useMyFollows, useMyPubkey } from '@/lib/nostr-bridge';
import { useAuthor } from '@/lib/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import { parentIdOf } from '@/lib/social/feed';
import { parseImeta } from '@/lib/social/imeta';
import { renderModeFor } from '@/lib/social/kinds';
import { embeddedRepostEvent, isRepost, repostTarget } from '@/lib/social/repost';
import { sensitiveInfo } from '@/lib/social/sensitive';
import {
  getCounts,
  subscribeCounts,
  bumpCounts,
  type NoteCounts,
} from '@/lib/social/engagement';
import { publishReaction, publishRepost } from '@/lib/social/publish';
import { usePreferences } from '@/lib/preferences';
import { groupNoteUrl, noteShareUrl } from '@/lib/social/note-links';
import { useToastStore } from '@/store/toast';
import UserAvatar from '@/components/UserAvatar';
import NoteContent from './NoteContent';
import { ArticleCard } from './ArticleCard';
import NoteMenu from './NoteMenu';
import MediaCarousel from './MediaCarousel';
import {
  ActionButton,
  LikeIcon,
  RepostButton,
  RepostIcon,
  ReplyIcon,
  ShareIcon,
  ZapIcon,
} from './NoteActions';

/** Above this many characters a note is collapsed behind "Show more". */
const LONG_NOTE_CHARS = 1000;

export type NoteCardProps = {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
  onOpenArticle?: (note: NostrEvent) => void;
  /** Hashtags open in-app (the feed's search) instead of leaving for /t. */
  onOpenTag?: (tag: string) => void;
  /**
   * Everyone who reposted this note, newest first. A repost row renders the
   * whole list; without it "eight people reposted this" reads as one
   * anonymous row, which throws away the only signal a repost carries.
   */
  reposters?: readonly string[];
  /**
   * `full` — a normal row with the whole action set.
   * `quoted` — a bordered box with no actions, for a note embedded inside
   *   another note's body (you act on the outer note, not the quoted one).
   *
   * These used to be one `embedded` boolean, which conflated "draw it as a
   * box" with "no actions". A repost needs the first and NOT the second: the
   * whole point is to reply to, like or zap the note that was reposted.
   */
  variant?: 'full' | 'quoted';
  /** Parent already supplies the outer padding (repost attribution wrapper). */
  nested?: boolean;
};

/**
 * Memoised on the note identity and the handlers.
 *
 * A feed holds hundreds of these. Any state change in the parent — a page
 * arriving, the live tail buffering, the moderation store ticking — used to
 * re-render every card, and each card does real work on render: parsing
 * imeta, tokenising `nostr:` references, scanning tags for content warnings.
 * The note itself is immutable once received, so re-running that is pure
 * waste.
 */
export default memo(NoteCardInner, (prev, next) => (
  prev.note.id === next.note.id
  && prev.variant === next.variant
  && prev.nested === next.nested
  && prev.onReply === next.onReply
  && prev.onQuote === next.onQuote
  && prev.onZap === next.onZap
  && prev.onOpenNote === next.onOpenNote
  && prev.onOpenProfile === next.onOpenProfile
  && prev.onOpenArticle === next.onOpenArticle
  && prev.onOpenTag === next.onOpenTag
  // Compared by length: the list is rebuilt each page, so reference equality
  // would defeat the memo, and reposters only ever grow for a given note.
  && (prev.reposters?.length ?? 0) === (next.reposters?.length ?? 0)
));

function NoteCardInner(props: NoteCardProps) {
  const { note } = props;

  // A repost is a wrapper, not content: rendering its `content` as text shows
  // the reader a wall of raw JSON.
  if (isRepost(note) && !props.nested && props.variant !== 'quoted') {
    return <RepostCard {...props} />;
  }
  return <PlainNoteCard {...props} />;
}

export { NoteCardInner };

function RepostCard(props: NoteCardProps) {
  const { t } = useTranslation();
  const { note, reposters } = props;
  const inner = useMemo(() => embeddedRepostEvent(note), [note]);
  const target = useMemo(() => repostTarget(note), [note]);

  // The row's own author first, then anyone else who reposted the same note.
  const everyone = useMemo(() => {
    const list = [note.pubkey, ...(reposters ?? [])];
    return [...new Set(list)];
  }, [note.pubkey, reposters]);

  return (
    <article className="note-card px-5 py-4" data-testid="repost-card">
      {/*
        The attribution was 11px muted text with a `⇄` glyph — small enough to
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
        // reposted — which is what the reader means by those buttons.
        <NoteCardInner {...props} note={inner} nested />
      ) : (
        // Empty-content repost: the target has to be fetched. Rather than
        // block the row, link out to what we know.
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
  const name = author?.displayName || author?.name || shortNpub(pubkey);
  return (
    <button
      type="button"
      className="font-semibold text-lc-white hover:underline"
      onClick={() => onOpenProfile?.(pubkey)}
    >
      {name}
    </button>
  );
}

function PlainNoteCard({
  note,
  onOpenProfile,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
  onOpenArticle,
  onOpenTag,
  variant = 'full',
  nested = false,
}: NoteCardProps) {
  const quoted = variant === 'quoted';
  const { t } = useTranslation();
  const meta = useAuthor(note.pubkey);
  const myPubkey = useMyPubkey();
  const follows = useMyFollows();
  const relays = usePreferences().socialRelays;
  const followSet = useMemo(() => new Set(follows), [follows]);
  const [counts, setCounts] = useState<NoteCounts>(() => getCounts(note.id));
  const [busy, setBusy] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const mode = renderModeFor(note.kind);
  const warning = useMemo(() => sensitiveInfo(note), [note]);
  const imeta = useMemo(() => parseImeta(note), [note]);
  const isThreadReply = parentIdOf(note) !== null;

  useEffect(() => subscribeCounts(note.id, setCounts), [note.id]);

  const displayName = meta?.displayName || meta?.name || shortNpub(note.pubkey);
  const canInteract = !!myPubkey;
  const isMine = myPubkey === note.pubkey;
  // Set lookup: a follow list runs to thousands and this renders per card.
  const isFollowed = followSet.has(note.pubkey);

  // Native share sheet where available, clipboard otherwise — both end with
  // an Obelisk URL, never a third-party viewer.
  const share = async () => {
    const url = noteShareUrl(note, relays);
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard?.writeText(url);
      useToastStore.getState().pushToast({ title: t('social.linkCopied'), body: '' });
    } catch {
      // Share sheet dismissed — not an error worth surfacing.
    }
  };

  const react = async () => {
    if (!canInteract || busy || reacted) return;
    setBusy(true);
    try {
      // "+" — NIP-25 says an emoji is explicitly NOT a like, so a heart
      // would undercount this note in every other client.
      await publishReaction(note);
      setReacted(true);
      bumpCounts(note.id, { reactionCount: 1 });
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: '' });
    } finally {
      setBusy(false);
    }
  };

  const repost = async () => {
    if (!canInteract || busy || reposted) return;
    setBusy(true);
    try {
      await publishRepost(note);
      setReposted(true);
      bumpCounts(note.id, { repostCount: 1 });
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: '' });
    } finally {
      setBusy(false);
    }
  };

  const hidden = warning.sensitive && !revealed;

  return (
    <article
      className={
        quoted
          ? 'rounded-xl border border-lc-border bg-lc-dark p-3'
          : nested
            ? ''
            : 'note-card px-5 py-4'
      }
      data-testid="note-card"
      data-kind={note.kind}
    >
      <header className="mb-2 flex items-start gap-3">
        <button type="button" className="shrink-0" onClick={() => onOpenProfile?.(note.pubkey)} aria-label={displayName}>
          <UserAvatar
            pubkey={note.pubkey}
            picture={meta?.picture}
            size={quoted ? 8 : 10}
            name={displayName}
            alt={displayName}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              className="min-w-0 truncate text-[15px] font-semibold text-lc-white hover:underline"
              onClick={() => onOpenProfile?.(note.pubkey)}
            >
              {displayName}
            </button>
            {/*
              In the Global feed every author looks the same as someone you
              follow, so there's no way to tell whose voice you chose and
              whose the relay handed you. The badge is deliberately quiet —
              it marks the familiar rather than shouting about strangers.
            */}
            {!quoted && isFollowed && !isMine && (
              <span
                className="shrink-0 rounded-full bg-lc-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-lc-green"
                data-testid="note-following-badge"
              >
                {t('social.followingBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-lc-muted">
            {isThreadReply && <span>↩ {t('social.reply')}</span>}
            {mode === 'article' && <span>{t('social.article')}</span>}
            {mode === 'highlight' && <span>{t('social.highlight')}</span>}
            <time dateTime={new Date(note.created_at * 1000).toISOString()}>
              {relativeTime(note.created_at, t)}
            </time>
          </div>
        </div>
        {/*
          Top-right, where every client puts it and where it can't be
          confused with the interaction row — down there it was a sixth
          action competing with reply and zap for the same thumb.
        */}
        {!quoted && <NoteMenu note={note} isMine={isMine} />}
      </header>

      {hidden ? (
        <button
          type="button"
          className="w-full rounded-xl border border-lc-border bg-lc-dark px-4 py-6 text-center text-xs text-lc-muted"
          onClick={() => setRevealed(true)}
          data-testid="note-content-warning"
        >
          {warning.reason
            ? `${t('social.sensitive')} · ${warning.reason}`
            : t('social.sensitive')}
        </button>
      ) : (
        <NoteBody
          note={note}
          mode={mode}
          imetaCount={imeta.size}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
          onOpenArticle={onOpenArticle}
          onOpenTag={onOpenTag}
        />
      )}

      {/*
        `justify-between` rather than a left-packed row: on a phone the five
        actions used a third of the card and left a dead zone the width of a
        thumb. Spread, each one gets its own column and the targets stop
        crowding each other.
      */}
      {!quoted && (
        <div className="mt-2 flex items-center justify-between gap-1 pt-1 text-xs sm:justify-start">
          <ActionButton
            kind="reply"
            label={t('social.replyAction')}
            icon={<ReplyIcon />}
            count={counts.replyCount}
            testId="note-reply"
            disabled={!canInteract}
            onClick={() => onReply?.(note)}
          />
          <RepostButton
            count={counts.repostCount}
            active={reposted}
            disabled={!canInteract || busy}
            onRepost={() => void repost()}
            onQuote={onQuote ? () => onQuote(note) : undefined}
          />
          <ActionButton
            kind="like"
            label={t('social.react')}
            icon={<LikeIcon filled={reacted} />}
            count={counts.reactionCount}
            testId="note-react"
            active={reacted}
            disabled={!canInteract || busy || reacted}
            onClick={() => void react()}
          />
          <ActionButton
            kind="zap"
            label={t('social.zap')}
            icon={<ZapIcon filled={counts.zapTotalSats > 0} />}
            count={counts.zapTotalSats}
            testId="note-zap"
            disabled={!canInteract}
            onClick={() => onZap?.(note)}
          />
          {/*
            Sharing was buried in the ⋯ menu, two taps deep, even though it's
            the thing a public note is for.
          */}
          <ActionButton
            kind="share"
            label={t('social.share')}
            icon={<ShareIcon />}
            testId="note-share"
            onClick={() => void share()}
          />
        </div>
      )}
    </article>
  );
}

function NoteBody({
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
      <div className="rounded-xl border border-lc-border bg-lc-dark p-3" data-testid="note-unsupported">
        {note.content.trim() ? (
          <div className="break-words text-[15px] leading-relaxed text-lc-white">
            <NoteContent content={note.content} noteId={note.id} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} onOpenTag={onOpenTag} />
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-lc-muted">
          {`${t('social.unsupportedKind')} (kind ${note.kind})`}
        </p>
      </div>
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
        <button
          type="button"
          className="mt-1 text-[13px] font-semibold text-lc-green hover:underline"
          onClick={() => setExpanded((value) => !value)}
          data-testid="note-show-more"
        >
          {t(expanded ? 'social.showLess' : 'social.showMore')}
        </button>
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

function relativeTime(createdAt: number, t: (key: string) => string): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
  if (seconds < 60) return t('social.now');
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(createdAt * 1000).toLocaleDateString();
}

function shortNpub(pubkey: string): string {
  try {
    return `${hexToNpub(pubkey).slice(0, 12)}…`;
  } catch {
    return `${pubkey.slice(0, 10)}…`;
  }
}
