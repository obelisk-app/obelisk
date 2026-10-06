'use client';

import type { GameState } from 'vesta';
import { useTranslations } from 'next-intl';
import { RESOURCES, RESOURCE_EMOJI, tradeAction } from './resources';
import { Chip, ResourceRow as Row } from './table-controls';
import type { VestaTurn } from '@/hooks/chat/games/vesta/useVestaTurn';
import Button from '@/components/ui/Button';
import Text from '@/components/ui/Text';

/** Trade with the bank at this seat's rates, or offer a trade to another player. */
export default function VestaTradePanel({ state, seatLabel, busy, turn }: {
  state: GameState;
  seatLabel: (seatId: string) => string;
  busy?: boolean;
  turn: VestaTurn;
}) {
  const t = useTranslations();
  const {
    myTurn, isSetup, participants, actingIdx, can, send, rates,
    tradePartner, setTradePartner, give, setGive, take, setTake,
  } = turn;
  if (!(myTurn && state.rolled && !isSetup && state.winner === null)) return null;
  return (
      <details className="rounded-lg border border-lc-border p-2" data-testid="vesta-trade">
        <summary className="cursor-pointer text-[11px] text-lc-muted">{t('games.vesta.trade')}</summary>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            <Text size="10" variant="label" tone="muted">{t('games.vesta.with')}</Text>
            <Chip label={t('games.vestaTable.bank')} active={tradePartner === 'bank'} onClick={() => setTradePartner('bank')} />
            {participants.map((seat, i) => i === actingIdx ? null : (
              <Chip key={seat} label={seatLabel(seat)} active={tradePartner === i} onClick={() => setTradePartner(i)} />
            ))}
          </div>
          <Row label={t('games.vesta.give')} values={give} setValues={setGive} max={(r) => state.players[actingIdx]?.resources[r] ?? 0} />
          <Row label={t('games.vesta.take')} values={take} setValues={setTake} max={() => 19} />
          {rates && tradePartner === 'bank' && (
            <p className="text-[10px] text-lc-muted">
              {t('games.vestaTable.bankRates', {
                rates: RESOURCES.map((r) => `${RESOURCE_EMOJI[r]}${rates[r]}:1`).join('  '),
              })}
            </p>
          )}
          <Button
            variant="pill"
            size="xs"
            disabled={
              busy || tradePartner === null
              || !can(tradeAction(tradePartner, give, take))
            }
            onClick={() => {
              void send(tradeAction(tradePartner!, give, take));
              setGive({});
              setTake({});
            }}
          >
            {t(tradePartner === 'bank' ? 'games.vestaTable.tradeBank' : 'games.vestaTable.offerTrade')}
          </Button>
        </div>
      </details>
  );
}
