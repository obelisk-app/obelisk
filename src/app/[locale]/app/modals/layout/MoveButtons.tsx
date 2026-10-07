'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { ChevronRightIcon } from '@/assets/icons';

/**
 * Up and down for a row in the layout editor: list-row ghost icon buttons
 * with chevrons (the ▲ ▼ glyphs they replace rendered in the OS font).
 */
export function MoveButtons({ onMove, first, last }: { onMove: (delta: number) => void; first: boolean; last: boolean }) {
  const t = useTranslations();
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={first} title={t('shell.desktop.layout.moveUp')} aria-label={t('shell.desktop.layout.moveUp')}>
        <ChevronRightIcon size={14} className="-rotate-90" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onMove(+1)} disabled={last} title={t('shell.desktop.layout.moveDown')} aria-label={t('shell.desktop.layout.moveDown')}>
        <ChevronRightIcon size={14} className="rotate-90" />
      </Button>
    </>
  );
}
