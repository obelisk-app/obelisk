'use client';

import type { RecentPickerEntry } from '@/utils/chat/picker/custom-emoji-entries';
import type { EmojiGridClasses } from '@/utils/chat/picker/emoji-picker-classes';
import { RecentEmojiButton } from './RecentEmojiButton';

/** The Recent section: Unicode picks as characters, custom picks as thumbnails. */
export function RecentEmojiSection({
  title,
  emptyLabel,
  entries,
  disabled,
  classes,
  onPickRecent,
}: {
  title: string;
  emptyLabel: string;
  entries: ReadonlyArray<RecentPickerEntry>;
  disabled: ReadonlySet<string>;
  classes: EmojiGridClasses;
  onPickRecent: (entry: RecentPickerEntry) => void;
}) {
  return (
    <div className="mb-2 scroll-mt-1" data-emoji-category="Recent">
      <div className={classes.sectionTitleClass}>{title}</div>
      <div className={classes.gridClass}>
        {entries.map((entry) => (
          <RecentEmojiButton key={`recent-${entry.char}`} entry={entry} mine={disabled.has(entry.char)} classes={classes} onPickRecent={onPickRecent} />
        ))}
      </div>
      {entries.length === 0 && <div className="px-1 py-3 text-xs text-lc-muted">{emptyLabel}</div>}
    </div>
  );
}
