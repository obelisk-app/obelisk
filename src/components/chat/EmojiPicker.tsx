'use client';

/**
 * The emoji picker: Unicode sections, recents and the relay's custom media,
 * as a desktop popover or a mobile sheet. The pieces sit in `./picker/`;
 * this file keeps the public names other folders import.
 */
import { EMOJI_CATEGORIES } from '@/lib/emoji';
import { useTranslation } from '@/i18n/context';
import { EMOJI_SECTIONS } from './picker/emoji-sections';
import { emojiPickerClasses } from './picker/emoji-picker-classes';
import { useEmojiPicker } from '@/hooks/chat/picker/useEmojiPicker';
import { useCategoryJump } from '@/hooks/chat/picker/useCategoryJump';
import { EmojiCategoryNav, EmojiPickerSearchBar } from './picker/EmojiPickerHeader';
import { CustomEmojiSection, EmojiCharButton, RecentEmojiSection } from './picker/EmojiGridParts';
import type { EmojiPickerProps } from './picker/picker-types';

export type { EmojiPickerProps, PickedCustomEmoji } from './picker/picker-types';
export { RecentIcon } from './picker/RecentIcon';
export { MediaPickerSearch } from './picker/MediaPickerSearch';

const NO_DISABLED: ReadonlySet<string> = new Set<string>();

export default function EmojiPicker({
  onPick,
  onClose,
  disabledEmojis,
  skipRecent = false,
  variant = 'popover',
  placement = 'above',
  align = 'right',
  showClose = true,
  className,
  customEmojis,
  customMediaKinds,
  columns,
  customEmojiAction,
  children,
}: EmojiPickerProps) {
  const { t } = useTranslation();
  const picker = useEmojiPicker({ customEmojis, customMediaKinds, skipRecent, onPick });
  const { activeCategory, scrollRef, jumpToCategory } = useCategoryJump();
  const classes = emojiPickerClasses({ variant, placement, align, columns });
  const disabled = disabledEmojis ?? NO_DISABLED;
  const { filtered } = picker;
  const section = (title: string, entries: Parameters<typeof CustomEmojiSection>[0]['entries'], action?: React.ReactNode) => (
    <CustomEmojiSection
      title={title}
      entries={entries}
      action={action}
      disabled={disabled}
      classes={classes}
      onPickCustom={picker.handlePickCustom}
    />
  );
  const charButton = (e: { char: string; keywords: string[] }) => (
    <EmojiCharButton
      key={e.char}
      char={e.char}
      keyword={e.keywords[0]}
      disabled={disabled.has(e.char)}
      className={classes.emojiBtnClass}
      onPick={picker.handlePick}
    />
  );

  return (
    <div
      role="dialog"
      aria-label={t('emoji.picker')}
      className={classes.containerClass + (className ?? '')}
      onClick={(e) => e.stopPropagation()}
    >
      {!filtered && <EmojiCategoryNav activeCategory={activeCategory} onJump={jumpToCategory} />}
      <EmojiPickerSearchBar
        isSheet={classes.isSheet}
        showClose={showClose}
        query={picker.query}
        onQuery={picker.setQuery}
        onClose={onClose}
      />
      <div ref={scrollRef} className={classes.scrollClass}>
        {filtered ? (
          <>
            {section('Server GIFs', picker.filteredCustomGifEntries)}
            {section('Server stickers', picker.filteredCustomStickerEntries)}
            {section('Server emojis', picker.filteredCustomEmojiEntries)}
            <div className={classes.gridClass}>
              {filtered.length === 0 && picker.filteredCustomCount === 0 && (
                <div className="col-span-8 py-4 text-center text-xs text-lc-muted">{t('emoji.noMatches')}</div>
              )}
              {filtered.map(charButton)}
            </div>
          </>
        ) : (
          <>
            {section("My emojis", [], customEmojiAction)}
            <RecentEmojiSection
              title={t('emoji.recent')}
              emptyLabel={t('emoji.noRecent')}
              entries={picker.recentEntries}
              disabled={disabled}
              classes={classes}
              onPick={picker.handlePick}
              onPickCustom={picker.handlePickCustom}
            />
            {section('Server GIFs', picker.customGifEntries)}
            {section('Server stickers', picker.customStickerEntries)}
            {section('Server emojis', picker.customEmojiEntries)}
            {EMOJI_SECTIONS.map((s) => (
              <div key={s.name} className="mb-2 scroll-mt-1" data-emoji-category={s.name}>
                <div className={classes.sectionTitleClass}>{s.label}</div>
                <div className={classes.gridClass}>
                  {s.categories.flatMap((category) => EMOJI_CATEGORIES[category] ?? []).map(charButton)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {children}
    </div>
  );
}
