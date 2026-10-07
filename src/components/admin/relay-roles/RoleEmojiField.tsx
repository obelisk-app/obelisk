'use client';

import EmojiPicker from '@/components/chat/picker/EmojiPicker';
import { CloseIcon } from '@/components/ui/icons/icons';
import { useTranslations } from 'next-intl';
import type { RelayRole } from '@/services/relay/relay-roles';
import IconButton from '@/components/ui/buttons/IconButton';
import { useRoleEmojiField } from '@/hooks/admin/relay-roles/useRoleEmojiField';

/** The role's badge emoji: a square button that opens the picker, with a small clear badge. */
export default function RoleEmojiField({ role, onPick }: { role: RelayRole; onPick: (emoji: string) => void }) {
  const t = useTranslations();
  const { anchor, buttonRef, toggle, close, pick, clear } = useRoleEmojiField(onPick);

  return (
    <div className="relative shrink-0">
      <IconButton
        tone="outline"
        shape="square"
        ref={buttonRef}
        onClick={toggle}
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
          onClick={clear}
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
          <div className="fixed inset-0 z-40" onClick={close} data-testid="role-emoji-backdrop" />
          <div className="fixed z-50" style={{ left: anchor.left, top: anchor.top }} data-testid={`role-emoji-popover-${role.id}`}>
            <EmojiPicker
              placement="below"
              align="left"
              skipRecent
              customEmojis={{}}
              onPick={pick}
              onClose={close}
            />
          </div>
        </>
      )}
    </div>
  );
}
