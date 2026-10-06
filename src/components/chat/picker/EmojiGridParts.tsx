'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import MediaThumb from '@/components/media/MediaThumb';
import type { RecentPickerEntry } from '@/utils/chat/picker/custom-emoji-entries';
import type { CustomEmojiEntry, PickedCustomEmoji } from '@/utils/chat/picker/picker-types';

/** The grid's slice of `emojiPickerClasses` (in `EmojiPicker.tsx`). */
type GridClasses = { gridClass: string; emojiBtnClass: string; sectionTitleClass: string; customImageClass: string };

/** One Unicode emoji in a grid; disabled (and titled so) when already reacted. */
export function EmojiCharButton({
  char,
  keyword,
  disabled,
  disabledTitle,
  className,
  onPick,
}: {
  char: string;
  keyword: string;
  disabled: boolean;
  /** The title of a disabled button, already in the reader's language. */
  disabledTitle: string;
  className: string;
  onPick: (char: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(char)}
      disabled={disabled}
      className={className}
      title={disabled ? disabledTitle : keyword}
    >
      {char}
    </button>
  );
}

/** A titled grid of custom media, with an optional leading action tile. */
export function CustomEmojiSection({
  title,
  entries,
  action,
  disabled,
  classes,
  onPickCustom,
}: {
  title: string;
  entries: ReadonlyArray<CustomEmojiEntry>;
  action?: ReactNode;
  disabled: ReadonlySet<string>;
  classes: GridClasses;
  onPickCustom: (emoji: PickedCustomEmoji) => void;
}) {
  const t = useTranslations();
  if (!action && entries.length === 0) return null;
  return (
    <div className="mb-2">
      <div className={classes.sectionTitleClass}>{title}</div>
      <div className={classes.gridClass}>
        {action}
        {entries.map((e) => {
          const shortcode = `:${e.name}:`;
          const mine = disabled.has(shortcode);
          return (
            <button
              key={`custom-${e.name}`}
              type="button"
              onClick={() => onPickCustom(e)}
              disabled={mine}
              className={classes.emojiBtnClass}
              title={mine ? t('chat.emoji.alreadyReacted') : shortcode}
            >
              <MediaThumb src={e.url} alt={shortcode} className={classes.customImageClass} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The Recent section: Unicode picks as characters, custom picks as thumbnails. */
export function RecentEmojiSection({
  title,
  emptyLabel,
  entries,
  disabled,
  classes,
  onPick,
  onPickCustom,
}: {
  title: string;
  emptyLabel: string;
  entries: ReadonlyArray<RecentPickerEntry>;
  disabled: ReadonlySet<string>;
  classes: GridClasses;
  onPick: (char: string) => void;
  onPickCustom: (emoji: PickedCustomEmoji) => void;
}) {
  return (
    <div className="mb-2 scroll-mt-1" data-emoji-category="Recent">
      <div className={classes.sectionTitleClass}>{title}</div>
      <div className={classes.gridClass}>
        {entries.map(({ char, custom }) => {
          const mine = disabled.has(char);
          return (
            <button
              key={`recent-${char}`}
              type="button"
              onClick={() => custom ? onPickCustom(custom) : onPick(char)}
              disabled={mine}
              className={classes.emojiBtnClass}
            >
              {custom ? (
                <MediaThumb src={custom.url} alt={char} className={classes.customImageClass} />
              ) : char}
            </button>
          );
        })}
      </div>
      {entries.length === 0 && <div className="px-1 py-3 text-xs text-lc-muted">{emptyLabel}</div>}
    </div>
  );
}
