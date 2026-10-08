'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import type { GroupedReaction } from '@/hooks/chat/message/useMessageActions';
import { resolveReactionEmoji } from '@/utils/message-text/emoji-shortcodes';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One reaction under a phone message: the emoji (or custom image) and its count. */
export function MobileReactionChip({
  reaction,
  isAdmin,
  onToggle,
}: {
  reaction: GroupedReaction;
  isAdmin?: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations();
  const resolved = resolveReactionEmoji(reaction.emoji, reaction.customEmojis);
  return (
    <Button
      variant="bare"
      className={`reaction ${reaction.mine ? 'mine' : ''}`}
      title={t(isAdmin ? 'mobile.reactions.removeEveryone' : reaction.mine ? 'mobile.reactions.removeOwn' : 'mobile.reactions.react')}
      onClick={onToggle}
    >
      {resolved.kind === 'custom' ? (
        <RemoteImage src={resolved.url} alt={`:${resolved.name}:`} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : resolved.char}{' '}
      {reaction.count}
    </Button>
  );
}
