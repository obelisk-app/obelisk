'use client';

import type { ReactNode } from 'react';
import type { CustomEmojiEntry, PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
import type { EmojiGridClasses } from '@/utils/chat/picker/emoji-picker-classes';
import { CustomEmojiButton } from './CustomEmojiButton';

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
  classes: EmojiGridClasses;
  onPickCustom: (emoji: PickedCustomEmoji) => void;
}) {
  if (!action && entries.length === 0) return null;
  return (
    <div className="mb-2">
      <div className={classes.sectionTitleClass}>{title}</div>
      <div className={classes.gridClass}>
        {action}
        {entries.map((e) => (
          <CustomEmojiButton key={`custom-${e.name}`} entry={e} mine={disabled.has(`:${e.name}:`)} classes={classes} onPickCustom={onPickCustom} />
        ))}
      </div>
    </div>
  );
}
