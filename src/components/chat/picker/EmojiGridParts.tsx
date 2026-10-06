'use client';

import type { ReactNode } from 'react';
import MediaThumb from '@/components/media/MediaThumb';
import type { EmojiPickerClasses } from './emoji-picker-classes';
import type { RecentPickerEntry } from './custom-emoji-entries';
import type { CustomEmojiEntry, PickedCustomEmoji } from './picker-types';

type GridClasses = Pick<EmojiPickerClasses, 'gridClass' | 'emojiBtnClass' | 'sectionTitleClass' | 'customImageClass'>;

/** One Unicode emoji in a grid; disabled (and titled so) when already reacted. */
export function EmojiCharButton({
  char,
  keyword,
  disabled,
  className,
  onPick,
}: {
  char: string;
  keyword: string;
  disabled: boolean;
  className: string;
  onPick: (char: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(char)}
      disabled={disabled}
      className={className}
      title={disabled ? 'Already reacted' : keyword}
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
              title={mine ? 'Already reacted' : shortcode}
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
