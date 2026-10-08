'use client';

import Button from '@/components/ui/buttons/Button';
import { type JsForumTag } from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { threadTagState } from '@/utils/shell/mobile/thread-tags';
import { MobileTagDot } from '../../screens/forum/MobileTagDot';

/** One tag in the new-thread picker: pressed when picked, faded and disabled once the limit is reached. */
export function NewThreadTagChip({
  tag,
  selectedTagIds,
  max,
  onToggle,
}: {
  tag: JsForumTag;
  selectedTagIds: ReadonlyArray<string>;
  max: number;
  onToggle: () => void;
}) {
  const { active, disabled } = threadTagState(selectedTagIds, tag.id, max);
  return (
    <Button
      variant="bare"
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="forum-chip"
      style={{ ...tagChipStyle(tag, active), opacity: disabled ? 0.4 : 1 }}
      data-testid={`mobile-new-thread-tag-${tag.id}`}
      aria-pressed={active}
    >
      {tag.emoji ? <span>{tag.emoji}</span> : <MobileTagDot tag={tag} />}
      <span>{tag.name}</span>
    </Button>
  );
}
