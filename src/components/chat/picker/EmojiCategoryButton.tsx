'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import type { MessageKey } from '@/i18n/keys';
import { RecentIcon } from '@/assets/icons';

/** One category in the picker's category bar; Recent shows the history icon. */
export function EmojiCategoryButton({ meta, active, onJump }: {
  meta: { name: string; icon: string; labelKey: MessageKey };
  active: boolean;
  onJump: (category: string) => void;
}) {
  const t = useTranslations();
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onJump(meta.name)}
      aria-label={t(meta.labelKey)}
      aria-pressed={active}
      title={t(meta.labelKey)}
      className={['flex h-10 min-w-0 items-center justify-center rounded-lg border-b-2 text-xl', active ? 'border-lc-green bg-lc-green/10' : 'border-transparent hover:bg-lc-border/60'].join(' ')}
    >
      {meta.name === 'Recent' ? <RecentIcon size={null} data-testid="recent-icon" className="h-5 w-5" /> : <span aria-hidden="true">{meta.icon}</span>}
    </Button>
  );
}
