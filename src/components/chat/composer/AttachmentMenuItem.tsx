'use client';

import { useTranslations } from 'next-intl';
import { MenuIcon, type MenuIconKind } from './composer-icons';

/** One entry of the composer's attachment menu; a disabled one says it is coming later. */
export function AttachmentMenuItem({ label, icon, onClick, disabled }: { label: string; icon: MenuIconKind; onClick?: () => void; disabled?: boolean }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-lc-green/15 text-lc-green">
        <MenuIcon kind={icon} />
      </span>
      <span>{label}</span>
      {disabled && <span className="ml-auto text-[10px] uppercase tracking-wide text-lc-muted">{t('chat.composer.later')}</span>}
    </button>
  );
}
