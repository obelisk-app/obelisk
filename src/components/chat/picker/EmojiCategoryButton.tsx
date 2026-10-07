'use client';

import { useTranslations } from 'next-intl';
import type { MessageKey } from '@/i18n/keys';
import { RecentIcon } from './RecentIcon';

/** One category in the picker's category bar; Recent shows the history icon. */
export function EmojiCategoryButton({ meta, active, onJump }: {
  meta: { name: string; icon: string; labelKey: MessageKey };
  active: boolean;
  onJump: (category: string) => void;
}) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={() => onJump(meta.name)}
      aria-label={t(meta.labelKey)}
      aria-pressed={active}
      title={t(meta.labelKey)}
      className={['flex h-10 min-w-0 items-center justify-center rounded-lg border-b-2 text-xl', active ? 'border-lc-green bg-lc-green/10' : 'border-transparent hover:bg-lc-border/60'].join(' ')}
    >
      {meta.name === 'Recent' ? <RecentIcon /> : <span aria-hidden="true">{meta.icon}</span>}
    </button>
  );
}
