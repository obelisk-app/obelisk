import { normalizeRoleEmoji } from '@/services/relay/relay-roles';

export const EMOJI_POPOVER_W = 360;
export const EMOJI_POPOVER_H = 430;

export interface PopoverAnchor { left: number; top: number }

/**
 * Where the role emoji picker opens beside its button, in fixed
 * coordinates: below when there is room, otherwise above, and clamped 8px
 * inside the viewport on every side.
 */
export function roleEmojiPopoverAnchor(
  rect: Pick<DOMRect, 'left' | 'top' | 'bottom'>,
  viewport: { width: number; height: number },
): PopoverAnchor {
  const room = viewport.height - rect.bottom;
  return {
    left: Math.max(8, Math.min(rect.left, viewport.width - EMOJI_POPOVER_W - 8)),
    top: room >= EMOJI_POPOVER_H + 12 ? rect.bottom + 4 : Math.max(8, rect.top - EMOJI_POPOVER_H - 4),
  };
}

/**
 * The badge glyph a picked emoji gives, or null. Unicode only: a custom
 * emoji (`:name:`) is a relay-scoped image, and the badge has to render from
 * the catalog alone on any client.
 */
export function roleBadgeGlyph(emoji: string): string | null {
  const glyph = normalizeRoleEmoji(emoji);
  return glyph && !glyph.startsWith(':') ? glyph : null;
}
