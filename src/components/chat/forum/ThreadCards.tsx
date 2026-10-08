'use client';

import Text from '@/components/ui/layout/Text';

/**
 * The publication cards and the list's loading, empty and no-match states.
 *
 * UX rule: only publications with at least one chat message are shown; empty
 * or aborted ones stay hidden until someone speaks. Both the list card and
 * the gallery card observe this rule (see `ThreadCard`). The gallery, the
 * states and the skeletons sit beside this file.
 */
import Card from '@/components/ui/layout/Card';
import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import { useUserMetadata, type JsForumTag, type JsGroup } from '@/services/nostr-bridge';
import { useLocale, useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { InlineTagChip } from './InlineTagChip';
import { ThreadCardSkeleton } from './ThreadCardSkeleton';
import { posterName } from '@/utils/chat/forum/forum-threads';
import { relativeTime } from '@/utils/format/relative-time';
import { useThreadCardData } from '@/hooks/chat/forum/useThreadCardData';

/**
 * Thread card (list view). Three states:
 *   - messages.length> 0                             → full render (OP + last + counts)
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
    <Card variant="interactive" padding="md" asChild>
      <Button
        variant="bare"
        type="button"
        onClick={onOpen}
        className="w-full text-left hover:border-lc-green/40 transition-colors"
        data-testid="thread-card"
        data-thread-id={thread.id}
      >
        <Row gap="3" align="start">
          {opMeta?.picture ? (
            <RemoteImage src={opMeta.picture} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-lc-border shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <Text as="div" size="sm" weight="semibold" tone="default" truncate="truncate">
              {thread.name || t('chat.forum.untitled')}
            </Text>
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
              <span>{t('chat.forum.op', { name: opName })}</span>
              <span>{t('chat.forum.messages', { count: messages.length })}</span>
              <span>{t('chat.forum.last', { name: lastName, time: relativeTime(lastMsg.createdAt, t, locale) })}</span>
            </div>
          </div>
          {thread.picture && (
            <RemoteImage
              src={thread.picture}
              alt=""
              className="w-12 h-12 rounded-lg object-cover shrink-0"
            />
          )}
        </Row>
      </Button>
    </Card>
  );
}
