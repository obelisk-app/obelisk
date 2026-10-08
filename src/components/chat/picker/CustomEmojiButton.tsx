'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import MediaThumb from '@/components/media/library/MediaThumb';
import type { CustomEmojiEntry, PickedCustomEmoji } from '@/types/chat/picker';
import type { EmojiGridClasses } from '@/utils/chat/picker/emoji-picker-classes';

/** One custom emoji in a grid; disabled (and titled so) when already reacted. */
export function CustomEmojiButton({ entry, mine, classes, onPickCustom }: {
  entry: CustomEmojiEntry;
  mine: boolean;
  classes: EmojiGridClasses;
  onPickCustom: (emoji: PickedCustomEmoji) => void;
}) {
  const t = useTranslations();
  const shortcode = `:${entry.name}:`;
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onPickCustom(entry)}
      disabled={mine}
      className={classes.emojiBtnClass}
      title={mine ? t('chat.emoji.alreadyReacted') : shortcode}
    >
      <MediaThumb src={entry.url} alt={shortcode} className={classes.customImageClass} />
    </Button>
  );
}
