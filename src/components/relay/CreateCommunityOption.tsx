'use client';

import { useTranslations } from 'next-intl';
import { ChevronRightIcon, LockIcon } from '@/assets/icons';
import Button from '@/components/ui/buttons/Button';

export function CreateCommunityOption({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('shell.rail.addModal');
  return (
    <Button
      variant="bare"
      className="flex w-full items-center gap-3 rounded-xl border border-lc-border bg-lc-card/60 p-3 text-left text-lc-white hover:border-lc-green/50 hover:bg-lc-card focus-visible:outline-2 focus-visible:outline-lc-green"
      onClick={onOpen}
      data-testid="create-community-option"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-lc-green/10 text-lc-green"><LockIcon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t('createCommunity')}</span>
        <span className="block text-xs text-lc-muted">{t('createHelp')}</span>
      </span>
      <ChevronRightIcon size={16} className="shrink-0 text-lc-muted" />
    </Button>
  );
}
