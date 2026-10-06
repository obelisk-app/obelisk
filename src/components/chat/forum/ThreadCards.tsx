'use client';

/**
 * The publication cards and the list's loading, empty and no-match states.
 *
 * UX rule: only publications with at least one chat message are shown; empty
 * or aborted ones stay hidden until someone speaks. Both the list card and
 * the gallery card observe this rule (see `ThreadCard`). The gallery, the
 * states and the skeletons sit beside this file.
 */
import { useUserMetadata, type JsForumTag, type JsGroup } from '@/services/nostr-bridge';
import { useLocale, useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/RemoteImage';
import { InlineTagChip } from './InlineTagChip';
import { ThreadCardSkeleton } from './ThreadCardSkeletons';
import { posterName } from '@/utils/chat/forum/forum-threads';
import { relativeTime } from '@/utils/format/relative-time';
import { useThreadCardData } from '@/hooks/chat/forum/useThreadCardData';

export { ThreadGallery } from './ThreadGallery';
export { LoadingThreads, EmptyForum, NoMatchingThreads } from './ThreadListStates';

/**
 * Thread card (list view). Three states:
 *   - messages.length > 0                             → full render (OP + last + counts)
 *   - messages.length === 0, status !== empty-confirmed → skeleton placeholder
 *   - messages.length === 0, status === empty-confirmed → return null (truly empty)
 *
 * Confidence comes from the bridge's retry ladder: it stays in
 * `empty-unconfirmed` while it re-fires the kind 9 REQ a few times
 * against auth-gated / silent-filtering relays before promoting to
 * `empty-confirmed`. The card flickers less and never hides a thread
 * that genuinely has messages just because the first EOSE landed empty.
 *
 * The skeleton is clickable: opening the thread sets it as the bridge's
 * active group, which bumps its kind 9 REQ to the head of the queue.
 */
export function ThreadCard({
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
  // Hooks must run unconditionally: pass `null` while there's nothing to
  // resolve so the user-metadata subscription stays inert until the first
  // message lands.
  const lastMeta = useUserMetadata(lastMsg?.pubkey ?? null);
  if (!op || !lastMsg) {
    if (messagesStatus === 'empty-confirmed') return null;
    return <ThreadCardSkeleton thread={thread} onOpen={onOpen} />;
  }
  const opName = posterName(opMeta, op.pubkey);
  const lastName = posterName(lastMeta, lastMsg.pubkey);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card w-full text-left p-3 hover:border-lc-green/40 transition-colors"
      data-testid="thread-card"
      data-thread-id={thread.id}
    >
      <div className="flex items-start gap-3">
        {opMeta?.picture ? (
          <RemoteImage src={opMeta.picture} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-border shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-lc-white truncate">
            {thread.name || '(untitled publication)'}
          </div>
          <div className="text-xs text-lc-muted line-clamp-2 mt-0.5 break-words">
            {op.content}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map((tag) => (
                <InlineTagChip key={tag.id} tag={tag} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 text-[11px] text-lc-muted mt-1.5">
            <span>OP {opName}</span>
            <span>{messages.length} {messages.length === 1 ? 'msg' : 'msgs'}</span>
            <span>last {lastName} · {relativeTime(lastMsg.createdAt, t, locale)}</span>
          </div>
        </div>
        {thread.picture && (
          <RemoteImage
            src={thread.picture}
            alt=""
            className="w-12 h-12 rounded-lg object-cover shrink-0"
          />
        )}
      </div>
    </button>
  );
}
