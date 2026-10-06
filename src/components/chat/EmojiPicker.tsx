'use client';

/**
 * The emoji picker: Unicode sections, recents and the relay's custom media,
 * as a desktop popover or a mobile sheet. The pieces sit in `./picker/`;
 * this file keeps the public names other folders import.
 */
import { EMOJI_CATEGORIES } from '@/lib/emoji';
import { useTranslations } from 'next-intl';
import { EMOJI_SECTIONS } from '@/utils/chat/picker/emoji-sections';
import { useEmojiPicker } from '@/hooks/chat/picker/useEmojiPicker';
import { useCategoryJump } from '@/hooks/chat/picker/useCategoryJump';
import { EmojiCategoryNav, EmojiPickerSearchBar } from './picker/EmojiPickerHeader';
import { CustomEmojiSection, EmojiCharButton, RecentEmojiSection } from './picker/EmojiGridParts';
import type { ReactNode } from 'react';
import type { CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import type { JsMediaKind } from '@/services/nostr-bridge';
import type { PickedCustomEmoji } from '@/utils/chat/picker/picker-types';

export type { PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
export { RecentIcon } from './picker/RecentIcon';
export { MediaPickerSearch } from './picker/MediaPickerSearch';

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

/**
 * The emoji picker's class strings for a variant. Surfaces follow the rest
 * of the app: a raised `lc-dark` panel on desktop (menus, modals), the
 * `lc-card` sheet surface on mobile, never the page's own `lc-black`, which
 * made the picker read as a hole in the chat. The colour lives in
 * `--picker-surface` so the sticky section headers can match it exactly,
 * including when MessageMediaPicker hosts this one.
 */
export function emojiPickerClasses({
  variant = 'popover',
  placement = 'above',
  align = 'right',
  columns,
}: Pick<EmojiPickerProps, 'variant' | 'placement' | 'align' | 'columns'>) {
  const isSheet = variant === 'sheet';
  const popoverPlacementClass = placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1';
  const panelClass = 'flex h-[430px] w-[360px] flex-col overflow-hidden rounded-xl border border-lc-border [--picker-surface:var(--color-lc-dark)] bg-[var(--picker-surface)] text-lc-white shadow-2xl ';
  const containerClass = isSheet
    ? 'flex h-full w-full flex-col bg-[var(--picker-surface,var(--color-lc-card))] p-2 text-lc-white '
    : variant === 'floating'
      ? panelClass
      : `absolute ${align === 'left' ? 'left-0' : 'right-0'} ${popoverPlacementClass} z-30 ${panelClass}`;
  const gridClass = columns === 12
    ? 'grid grid-cols-12 gap-0.5'
    : isSheet
      ? 'grid grid-cols-7 gap-1.5'
      : 'grid grid-cols-8 gap-1 px-3';
  const emojiBtnClass = isSheet
    ? 'flex aspect-square items-center justify-center rounded-md text-2xl active:bg-lc-border disabled:cursor-default disabled:opacity-40'
    : 'flex aspect-square items-center justify-center rounded-md text-2xl hover:bg-lc-border disabled:cursor-default disabled:opacity-40';
  const scrollClass = isSheet
    ? 'relative min-h-0 flex-1 overflow-y-auto'
    : 'relative min-h-0 flex-1 overflow-y-auto pb-3';
  const sectionTitleClass = isSheet
    ? 'sticky top-0 z-10 mb-2 border-b border-lc-border bg-[var(--picker-surface,var(--color-lc-card))] px-1 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted'
    : 'sticky top-0 z-10 mb-2 bg-[var(--picker-surface,var(--color-lc-dark))] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted';
  const customImageClass = isSheet
    ? 'h-[1.45em] w-[1.45em] object-contain'
    : 'h-8 w-8 object-contain';
  return { isSheet, containerClass, gridClass, emojiBtnClass, scrollClass, sectionTitleClass, customImageClass };
}

export type EmojiPickerClasses = ReturnType<typeof emojiPickerClasses>;

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
              onPick={picker.handlePick}
              onPickCustom={picker.handlePickCustom}
            />
            {section(t('chat.mediaPicker.serverGifs'), picker.customGifEntries)}
            {section(t('chat.mediaPicker.serverStickers'), picker.customStickerEntries)}
            {section(t('chat.emoji.serverEmojis'), picker.customEmojiEntries)}
            {EMOJI_SECTIONS.map((s) => (
              <div key={s.name} className="mb-2 scroll-mt-1" data-emoji-category={s.name}>
                <div className={classes.sectionTitleClass}>{t(s.labelKey)}</div>
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
