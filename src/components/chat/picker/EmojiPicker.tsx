'use client';

/**
 * The emoji picker: Unicode sections, recents and the relay's custom media,
 * as a desktop popover or a mobile sheet. The pieces sit in `./picker/`;
 * this file keeps the public names other folders import.
 */
import { useTranslations } from 'next-intl';
import { sectionEmojis } from '@/utils/chat/picker/emoji-sections';
import { EMOJI_SECTIONS } from '@/constants/chat/picker';
import { emojiPickerClasses } from '@/utils/chat/picker/emoji-picker-classes';
import { useEmojiPicker } from '@/hooks/chat/picker/useEmojiPicker';
import { useCategoryJump } from '@/hooks/chat/picker/useCategoryJump';
import { EmojiCategoryNav } from './EmojiCategoryNav';
import { EmojiPickerSearchBar } from './EmojiPickerSearchBar';
import { CustomEmojiSection } from './CustomEmojiSection';
import { EmojiCharButton } from './EmojiCharButton';
import { RecentEmojiSection } from './RecentEmojiSection';
import type { ReactNode } from 'react';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { JsMediaKind } from '@/services/nostr-bridge';
import type { PickedCustomEmoji } from '@/types/chat/picker';

export interface EmojiPickerProps {
  onPick: (emoji: string, custom?: PickedCustomEmoji) => void;
  onClose: () => void;
  /** Emojis disabled (e.g. ones the user already reacted with). */
  disabledEmojis?: ReadonlySet<string>;
  /** When true, picking does not record in recents (useful for previews). */
  skipRecent?: boolean;
  /**
   * `popover` (default): small absolute-positioned floating panel for desktop.
   * `sheet`: fills its parent (used inside the mobile bottom-sheet host).
   * `floating`: the popover panel without its own positioning, for a host
   * that places it (`FloatingPanel`, which escapes scroll containers).
   */
  variant?: 'popover' | 'sheet' | 'floating';
  /** Popover direction relative to the trigger. Ignored for sheet variant. */
  placement?: 'above' | 'below';
  /**
   * Which edge of the trigger the popover hangs from. Defaults to `right`
   * (the composer/reaction buttons sit on the right of their row); triggers on
   * the left of a panel need `left` or the popover runs off it.
   */
  align?: 'left' | 'right';
  showClose?: boolean;
  className?: string;
  customEmojis?: CustomEmojiMap;
  customMediaKinds?: Readonly<Record<string, JsMediaKind>>;
  columns?: 7 | 12;
  customEmojiAction?: ReactNode;
  children?: ReactNode;
}

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
  const t = useTranslations();
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
  const alreadyReacted = t('chat.emoji.alreadyReacted');
  const charButton = (e: { char: string; keywords: string[] }) => (
    <EmojiCharButton
      key={e.char}
      char={e.char}
      keyword={e.keywords[0]}
      disabled={disabled.has(e.char)}
      disabledTitle={alreadyReacted}
      className={classes.emojiBtnClass}
      onPick={picker.handlePick}
    />
  );

  return (
    <div
      role="dialog"
      aria-label={t('chat.emoji.picker')}
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
            {section(t('chat.mediaPicker.serverGifs'), picker.filteredCustomGifEntries)}
            {section(t('chat.mediaPicker.serverStickers'), picker.filteredCustomStickerEntries)}
            {section(t('chat.emoji.serverEmojis'), picker.filteredCustomEmojiEntries)}
            <div className={classes.gridClass}>
              {filtered.length === 0 && picker.filteredCustomCount === 0 && (
                <div className="col-span-8 py-4 text-center text-xs text-lc-muted">{t('chat.emoji.noMatches')}</div>
              )}
              {filtered.map(charButton)}
            </div>
          </>
        ) : (
          <>
            {section(t('chat.emoji.myEmojis'), [], customEmojiAction)}
            <RecentEmojiSection
              title={t('chat.emoji.recent')}
              emptyLabel={t('chat.emoji.noRecent')}
              entries={picker.recentEntries}
              disabled={disabled}
              classes={classes}
              onPickRecent={picker.handlePickRecent}
            />
            {section(t('chat.mediaPicker.serverGifs'), picker.customGifEntries)}
            {section(t('chat.mediaPicker.serverStickers'), picker.customStickerEntries)}
            {section(t('chat.emoji.serverEmojis'), picker.customEmojiEntries)}
            {EMOJI_SECTIONS.map((s) => (
              <div key={s.name} className="mb-2 scroll-mt-1" data-emoji-category={s.name}>
                <div className={classes.sectionTitleClass}>{t(s.labelKey)}</div>
                <div className={classes.gridClass}>
                  {sectionEmojis(s).map(charButton)}
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
