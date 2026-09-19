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

import { useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { hexToNpub } from '@nostr-wot/data';
import { nostrActions, useMyPubkey, useUserMetadata } from '@/lib/nostr-bridge';
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
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/toast';
import UserAvatar from '@/components/UserAvatar';
import NoteContent from './NoteContent';
import {
  ActionButton,
  LikeIcon,
  MoreIcon,
  RepostButton,
  ReplyIcon,
  ZapIcon,
  formatCount,
} from './NoteActions';

export type NoteCardProps = {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
  /** Rendered inside a quote/repost frame — suppresses nested chrome. */
  embedded?: boolean;
};

export default function NoteCard(props: NoteCardProps) {
  const { note } = props;

  // A repost is a wrapper, not content: rendering its `content` as text shows
  // the reader a wall of raw JSON.
  if (isRepost(note) && !props.embedded) {
    return <RepostCard {...props} />;
  }
  return <PlainNoteCard {...props} />;
}

function RepostCard(props: NoteCardProps) {
  const { t } = useTranslation();
  const { note } = props;
  const reposter = useUserMetadata(note.pubkey);
  const inner = useMemo(() => embeddedRepostEvent(note), [note]);
  const target = useMemo(() => repostTarget(note), [note]);

  const name = reposter?.displayName || reposter?.name || shortNpub(note.pubkey);

  return (
    <article className="px-5 py-4" data-testid="repost-card">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-lc-muted">
        <span aria-hidden="true">⇄</span>
        <button
          type="button"
          className="hover:underline"
          onClick={() => props.onOpenProfile?.(note.pubkey)}
        >
          {`${name} ${t('social.reposted')}`}
        </button>
      </div>
      {inner ? (
        <NoteCard {...props} note={inner} embedded />
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

function PlainNoteCard({
  note,
  onOpenProfile,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
  embedded = false,
}: NoteCardProps) {
  const { t } = useTranslation();
  const meta = useUserMetadata(note.pubkey);
  const myPubkey = useMyPubkey();
  const [counts, setCounts] = useState<NoteCounts>(() => getCounts(note.id));
  const [busy, setBusy] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const mode = renderModeFor(note.kind);
  const warning = useMemo(() => sensitiveInfo(note), [note]);
  const imeta = useMemo(() => parseImeta(note), [note]);
  const isThreadReply = parentIdOf(note) !== null;

  useEffect(() => {
    void nostrActions.ensureUserMetadata(note.pubkey).catch(() => {});
  }, [note.pubkey]);

  useEffect(() => subscribeCounts(note.id, setCounts), [note.id]);

  const displayName = meta?.displayName || meta?.name || shortNpub(note.pubkey);
  const canInteract = !!myPubkey;

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
      className={embedded ? 'rounded-xl border border-lc-border bg-lc-dark p-3' : 'px-5 py-4'}
      data-testid="note-card"
      data-kind={note.kind}
    >
      <header className="mb-2 flex items-center gap-3">
        <button type="button" onClick={() => onOpenProfile?.(note.pubkey)} aria-label={displayName}>
          <UserAvatar
            pubkey={note.pubkey}
            picture={meta?.picture}
            size={embedded ? 8 : 10}
            name={displayName}
            alt={displayName}
          />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="block truncate text-sm font-semibold text-lc-white hover:underline"
            onClick={() => onOpenProfile?.(note.pubkey)}
          >
            {displayName}
          </button>
          <div className="flex items-center gap-2 text-[10px] text-lc-muted">
            {isThreadReply && <span>↩ {t('social.reply')}</span>}
            {mode === 'article' && <span>{t('social.article')}</span>}
            {mode === 'highlight' && <span>{t('social.highlight')}</span>}
            <time dateTime={new Date(note.created_at * 1000).toISOString()}>
              {relativeTime(note.created_at, t)}
            </time>
          </div>
        </div>
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
        />
      )}

      {!embedded && (
        <div className="mt-2 flex items-center gap-1 pt-1 text-xs">
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
          <NoteMenu note={note} isMine={myPubkey === note.pubkey} />
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
}: {
  note: NostrEvent;
  mode: ReturnType<typeof renderModeFor>;
  imetaCount: number;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  const { t } = useTranslation();

  if (mode === 'article') {
    // Addressable long-form: a card, not raw markdown in a note bubble.
    const title = note.tags.find((tag) => tag[0] === 'title')?.[1];
    const summary = note.tags.find((tag) => tag[0] === 'summary')?.[1];
    const image = note.tags.find((tag) => tag[0] === 'image')?.[1];
    return (
      <div className="overflow-hidden rounded-xl border border-lc-border bg-lc-dark" data-testid="note-article">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-32 w-full object-cover" loading="lazy" />
        )}
        <div className="p-3">
          <div className="text-sm font-semibold text-lc-white">{title || t('social.article')}</div>
          {summary && <p className="mt-1 line-clamp-3 text-xs text-lc-muted">{summary}</p>}
        </div>
      </div>
    );
  }

  if (mode === 'highlight') {
    // The content is SOMEONE ELSE'S words. Rendering it as the author's own
    // is the classic bug with kind 9802.
    const source = note.tags.find((tag) => tag[0] === 'r')?.[1];
    return (
      <blockquote className="border-l-2 border-lc-green pl-3 text-sm italic text-lc-white" data-testid="note-highlight">
        {note.content}
        {source && (
          <a href={source} target="_blank" rel="noreferrer noopener" className="mt-1 block text-[10px] not-italic text-lc-muted underline">
            {source}
          </a>
        )}
      </blockquote>
    );
  }

  if (mode === 'unsupported') {
    return (
      <div className="rounded-xl border border-lc-border bg-lc-dark p-3 text-xs text-lc-muted" data-testid="note-unsupported">
        {`${t('social.unsupportedKind')} (kind ${note.kind})`}
      </div>
    );
  }

  return (
    <div className="break-words text-sm text-lc-white">
      <NoteContent
        content={note.content}
        noteId={note.id}
        onOpenProfile={onOpenProfile}
        onOpenNote={onOpenNote}
      />
      {/* Picture/video notes put the media in imeta; content is a caption. */}
      {(mode === 'picture' || mode === 'video') && imetaCount > 0 && (
        <ImetaMedia note={note} />
      )}
    </div>
  );
}

function ImetaMedia({ note }: { note: NostrEvent }) {
  const media = useMemo(() => [...parseImeta(note).values()], [note]);
  return (
    <div className="mt-2 grid gap-2" data-testid="note-imeta-media">
      {media.map((item) => (
        item.mimeType?.startsWith('video/') ? (
          <video
            key={item.url}
            src={item.url}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-xl"
            style={item.width && item.height ? { aspectRatio: `${item.width}/${item.height}` } : undefined}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={item.url}
            src={item.url}
            alt={item.alt ?? ''}
            loading="lazy"
            className="w-full rounded-xl object-cover"
            // `dim` reserves layout space so the feed doesn't jump as images load.
            style={item.width && item.height ? { aspectRatio: `${item.width}/${item.height}` } : undefined}
          />
        )
      ))}
    </div>
  );
}

function NoteMenu({ note, isMine }: { note: NostrEvent; isMine: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(note.pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);

  const copyLink = () => {
    try {
      const nevent = nip19.neventEncode({ id: note.id, author: note.pubkey });
      void navigator.clipboard?.writeText(`https://njump.me/${nevent}`);
      useToastStore.getState().pushToast({ title: t('social.linkCopied'), body: '' });
    } catch {
      // Clipboard unavailable — not worth an error state.
    }
    setOpen(false);
  };

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        className="group/act -m-1 flex items-center rounded-full p-1 text-lc-muted transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('social.more')}
        aria-expanded={open}
        data-testid="note-more"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full transition-colors group-hover/act:bg-white/10 group-hover/act:text-lc-white">
          <MoreIcon />
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-lc-border bg-lc-dark py-1 shadow-2xl">
          <button type="button" className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5" onClick={copyLink}>
            {t('social.copyLink')}
          </button>
          {!isMine && (
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5"
              onClick={() => { toggleMute(note.pubkey); setOpen(false); }}
            >
              {t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
            </button>
          )}
        </div>
      )}
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
