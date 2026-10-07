'use client';

import type { GameState } from 'vesta';
import { useTranslations } from 'next-intl';
import PartnerChip from './PartnerChip';
import ResourceRow from './ResourceRow';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { useVestaTradePanel } from '@/hooks/games/vesta/useVestaTradePanel';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';

/** Trade with the bank at this seat's rates, or offer a trade to another player. */
export default function VestaTradePanel({ state, seatLabel, busy, turn }: {
  state: GameState;
  seatLabel: (seatId: string) => string;
  busy?: boolean;
  turn: VestaTurn;
}) {
  const t = useTranslations();
  const vm = useVestaTradePanel({ state, busy, turn });
  if (!vm.visible) return null;
  return (
      <details className="rounded-lg border border-lc-border p-2" data-testid="vesta-trade">
        <summary className="cursor-pointer text-[11px] text-lc-muted">{t('games.vesta.trade')}</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            <Text size="10" variant="label" tone="muted">{t('games.vesta.with')}</Text>
            <PartnerChip label={t('games.vestaTable.bank')} active={vm.isBank} onClick={() => vm.choosePartner('bank')} />
            {vm.partners.map((p) => (
              <PartnerChip key={p.seat} label={seatLabel(p.seat)} active={vm.partner === p.index} onClick={() => vm.choosePartner(p.index)} />
            ))}
          </div>
          <ResourceRow label={t('games.vesta.give')} values={vm.give} onChange={vm.setGiveCount} max={vm.giveMax} />
          <ResourceRow label={t('games.vesta.take')} values={vm.take} onChange={vm.setTakeCount} max={vm.takeMax} />
          {vm.bankRates && (
            <Text as="p" size="10" tone="muted">
              {t('games.vestaTable.bankRates', { rates: vm.bankRates })}
            </Text>
          )}
          <Button
            variant="pill"
            size="xs"
            disabled={!vm.canSubmit}
            onClick={vm.submit}
          >
            {t(vm.isBank ? 'games.vestaTable.tradeBank' : 'games.vestaTable.offerTrade')}
          </Button>
        </div>
      </details>
  );
}
