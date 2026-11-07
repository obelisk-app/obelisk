'use client';

import Button from '@/components/ui/buttons/Button';
import { useMobileReactionChip } from '@/hooks/shell/mobile/screens/channel/useMobileReactionChip';
import type { GroupedReaction } from '@/hooks/chat/message/useMessageActions';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One reaction under a phone message: the emoji (or custom image) and its count. */
export function MobileReactionChip({
  reaction,
  onToggle,
}: {
  reaction: GroupedReaction;
  onToggle: () => void;
}) {
  const { resolved, title } = useMobileReactionChip(reaction);
  return (
    <Button
      variant="bare"
      className={`reaction ${reaction.mine ? 'mine' : ''}`}
      title={title}
      onClick={onToggle}
    >
      {resolved.kind === 'custom' ? (
        <RemoteImage src={resolved.url} alt={`:${resolved.name}:`} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : resolved.char}{' '}
      {reaction.count}
    </Button>
  );
}
