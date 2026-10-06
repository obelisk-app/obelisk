'use client';

import { useRef, useState } from 'react';
import EmojiPicker from '@/components/chat/EmojiPicker';
import { CloseIcon } from '@/components/ui/icons';
import { useTranslations } from 'next-intl';
import { normalizeRoleEmoji, type RelayRole } from '@/services/relay-roles';
import IconButton from '@/components/ui/IconButton';

const EMOJI_POPOVER_W = 360;
const EMOJI_POPOVER_H = 430;

/** The role's badge emoji: a square button that opens the picker, with a small clear badge. */
export default function RoleEmojiField({ role, onPick }: { role: RelayRole; onPick: (emoji: string) => void }) {
  const t = useTranslations();
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // The picker lives in a fixed layer rather than inside this row: the roles
  // panel is overflow-hidden and the list scrolls, so an absolutely positioned
  // popover gets clipped away entirely. Anchored off the button's rect and
  // flipped/clamped so it stays on screen from any row.
  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const room = window.innerHeight - rect.bottom;
    setAnchor({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - EMOJI_POPOVER_W - 8)),
      top: room >= EMOJI_POPOVER_H + 12 ? rect.bottom + 4 : Math.max(8, rect.top - EMOJI_POPOVER_H - 4),
    });
  };

  return (
    <div className="relative shrink-0">
      <IconButton
        tone="outline"
        shape="square"
        ref={buttonRef}
        onClick={() => (anchor ? setAnchor(null) : open())}
        aria-label={t('admin.roles.emojiLabel', { role: role.id })}
        aria-expanded={!!anchor}
        title={t('admin.roles.badgeEmoji')}
        className="text-base"
      >
        {role.emoji || <span className="text-xs text-lc-muted">+</span>}
      </IconButton>
      {role.emoji && (
        <button
          type="button"
          onClick={() => onPick('')}
          aria-label={t('admin.roles.clearEmoji', { role: role.id })}
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-lc-border bg-lc-dark text-lc-muted hover:text-lc-white"
        >
          <CloseIcon size={8} strokeWidth={2.5} />
        </button>
      )}
      {anchor && (
        <>
          {/* Catches the click that dismisses the picker without closing the
              surrounding roles modal, and without the click landing on
              whatever sits under it: this is why it is not useDismiss. */}
          <div className="fixed inset-0 z-40" onClick={() => setAnchor(null)} data-testid="role-emoji-backdrop" />
          <div className="fixed z-50" style={{ left: anchor.left, top: anchor.top }} data-testid={`role-emoji-popover-${role.id}`}>
            <EmojiPicker
              placement="below"
              align="left"
              skipRecent
              customEmojis={{}}
              onPick={(emoji) => {
                // Unicode only: a custom emoji is a relay-scoped image, and the
                // badge has to render from the catalog alone on any client.
                const glyph = normalizeRoleEmoji(emoji);
                if (glyph && !glyph.startsWith(':')) onPick(glyph);
                setAnchor(null);
              }}
              onClose={() => setAnchor(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
