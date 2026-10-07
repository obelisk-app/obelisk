/** Where and how the emoji picker is drawn (the matching `EmojiPicker` props). */
export interface EmojiPickerLayout {
  variant?: 'popover' | 'sheet' | 'floating';
  placement?: 'above' | 'below';
  align?: 'left' | 'right';
  columns?: 7 | 12;
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
}: EmojiPickerLayout) {
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

/** The grid's slice of `EmojiPickerClasses`, what the section parts read. */
export type EmojiGridClasses = Pick<EmojiPickerClasses, 'gridClass' | 'emojiBtnClass' | 'sectionTitleClass' | 'customImageClass'>;
