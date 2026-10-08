'use client';

import Button from '@/components/ui/buttons/Button';
import MediaThumb from '@/components/media/library/MediaThumb';
import type { RecentPickerEntry } from '@/utils/chat/picker/custom-emoji-entries';
import type { EmojiGridClasses } from '@/utils/chat/picker/emoji-picker-classes';

/** One recent pick: a custom one as its thumbnail, a Unicode one as its character. */
export function RecentEmojiButton({ entry, mine, classes, onPickRecent }: {
  entry: RecentPickerEntry;
  mine: boolean;
  classes: EmojiGridClasses;
  onPickRecent: (entry: RecentPickerEntry) => void;
}) {
  return (
    <Button variant="bare" type="button" onClick={() => onPickRecent(entry)} disabled={mine} className={classes.emojiBtnClass}>
      {entry.custom ? (
        <MediaThumb src={entry.custom.url} alt={entry.char} className={classes.customImageClass} />
      ) : entry.char}
    </Button>
  );
}
