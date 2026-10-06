'use client';

import type { GameState } from 'vesta';
import type { VestaAction } from '@/lib/games/vesta/definition';
import { useTranslations } from 'next-intl';
import { RESOURCES, RESOURCE_EMOJI, describe, filled, sum } from './resources';
import { Counter } from './table-controls';
import type { VestaTurn } from '@/hooks/chat/games/vesta/useVestaTurn';
import Button from '@/components/ui/Button';

/**
 * Whatever the rules are waiting on from this seat outside its own turn
 * actions: the discard after a seven, a trade offer to answer or withdraw,
 * the robber, and who to rob.
 */
export default function VestaPrompts({ state, seatLabel, busy, turn }: {
  state: GameState;
  seatLabel: (seatId: string) => string;
  busy?: boolean;
  turn: VestaTurn;
}) {
  const t = useTranslations();
  const {
    participants, actingIdx, can, send, mustDiscard, myHandSize, discard, setDiscard,
    pendingTrade, iAmTradeTarget, iAmProposer, robberPending, showSteal, stealVictims, skipSteal,
  } = turn;
  return (
    <>
      {/* The seven: everyone over seven cards discards, whoever's turn it is */}
      {mustDiscard && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3" data-testid="vesta-discard">
          <p className="text-[11px] text-lc-white">
            {t('games.vestaTable.discardPrompt', { count: Math.floor(myHandSize / 2), total: myHandSize })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RESOURCES.map((r) => (
              <Counter
                key={r}
                label={`${RESOURCE_EMOJI[r]}`}
                value={discard[r] ?? 0}
                max={state.players[actingIdx]?.resources[r] ?? 0}
                onChange={(v) => setDiscard((d) => ({ ...d, [r]: v }))}
              />
            ))}
          </div>
          <Button
            variant="pill"
            size="xs"
            disabled={busy || sum(discard) !== Math.floor(myHandSize / 2)}
            onClick={() => {
              void send({ type: 'discard-resources', resources: filled(discard) } as VestaAction);
              setDiscard({});
            }}
            className="mt-2"
          >
            {t('games.vestaTable.discard', { picked: sum(discard), count: Math.floor(myHandSize / 2) })}
          </Button>
        </div>
      )}

      {/* Someone offered us a trade */}
      {pendingTrade && (iAmTradeTarget || iAmProposer) && (
        <div className="rounded-lg border border-lc-border p-3" data-testid="vesta-trade-offer">
          <p className="text-[11px] text-lc-white">
            {t('games.vestaTable.offers', {
              name: seatLabel(participants[pendingTrade.from] ?? ''),
              give: describe(pendingTrade.give) ?? t('games.vestaTable.nothing'),
              take: describe(pendingTrade.take) ?? t('games.vestaTable.nothing'),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            {iAmTradeTarget && (
              <>
                <Button
                  variant="pill"
                  size="xs"
                  disabled={busy}
                  onClick={() => void send({ type: 'accept-trade' } as VestaAction)}
                >
                  {t('games.vesta.accept')}
                </Button>
                <Button
                  variant="pillSecondary"
                  size="xs"
                  disabled={busy}
                  onClick={() => void send({ type: 'reject-trade' } as VestaAction)}
                >
                  {t('games.vesta.reject')}
                </Button>
              </>
            )}
            {iAmProposer && (
              <Button
                variant="pillSecondary"
                size="xs"
                disabled={busy}
                onClick={() => void send({ type: 'cancel-proposal' } as VestaAction)}
              >
                {t('games.vesta.withdraw')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* The robber is out and wants a target */}
      {robberPending && (
        <p className="rounded-lg border border-lc-green/40 bg-lc-green/10 p-2 text-center text-[11px] text-lc-green" data-testid="vesta-robber-prompt">
          {t('games.vesta.robber')}
        </p>
      )}

      {/* Who to rob */}
      {showSteal && (
        <div className="rounded-lg border border-lc-border p-3" data-testid="vesta-steal">
          <p className="text-[11px] text-lc-white">{t('games.vesta.steal')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stealVictims.map((victim) => (
              <div key={victim} className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-lc-muted">{seatLabel(participants[victim] ?? '')}:</span>
                {RESOURCES.map((r) => (
                  <Button
                    variant="outline"
                    size="xs"
                    key={r}
                    disabled={busy || !can({ type: 'steal-resource', victim, resource: r } as VestaAction)}
                    onClick={() => void send({ type: 'steal-resource', victim, resource: r } as VestaAction)}
                  >
                    {RESOURCE_EMOJI[r]}
                  </Button>
                ))}
              </div>
            ))}
            <Button
              variant="pillSecondary"
              size="md"
              onClick={skipSteal}
              className="text-[11px]"
            >
              {t('games.vesta.skip')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
