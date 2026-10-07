'use client';

import { useTranslations } from 'next-intl';
import MediaThumb from '@/components/media/library/MediaThumb';
import type { CustomEmojiEntry, PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
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
    <button
      type="button"
      onClick={() => onPickCustom(entry)}
      disabled={mine}
      className={classes.emojiBtnClass}
      title={mine ? t('chat.emoji.alreadyReacted') : shortcode}
    >
      <MediaThumb src={entry.url} alt={shortcode} className={classes.customImageClass} />
    </button>
  );
}
