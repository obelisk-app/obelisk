'use client';

import type { GameState } from 'vesta';
import { useTranslations } from 'next-intl';
import { RESOURCE_EMOJI } from '@/utils/games/vesta/resources';
import ResourceCounter from './ResourceCounter';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { useVestaPrompts } from '@/hooks/games/vesta/useVestaPrompts';
import Button from '@/components/ui/buttons/Button';

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
  const vm = useVestaPrompts({ state, busy, turn });
  return (
    <>
      {/* The seven: everyone over seven cards discards, whoever's turn it is */}
      {vm.mustDiscard && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3" data-testid="vesta-discard">
          <p className="text-[11px] text-lc-white">
            {t('games.vestaTable.discardPrompt', { count: vm.discardCount, total: turn.myHandSize })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vm.discardCounters.map((c) => (
              <ResourceCounter
                key={c.resource}
                label={`${RESOURCE_EMOJI[c.resource]}`}
                value={c.value}
                max={c.max}
                onChange={(v) => vm.setDiscardCount(c.resource, v)}
              />
            ))}
          </div>
          <Button
            variant="pill"
            size="xs"
            disabled={!vm.canDiscard}
            onClick={vm.submitDiscard}
            className="mt-2"
          >
            {t('games.vestaTable.discard', { picked: vm.discardPicked, count: vm.discardCount })}
          </Button>
        </div>
      )}

      {/* Someone offered us a trade */}
      {vm.offer && (
        <div className="rounded-lg border border-lc-border p-3" data-testid="vesta-trade-offer">
          <p className="text-[11px] text-lc-white">
            {t('games.vestaTable.offers', {
              name: seatLabel(vm.offer.fromSeat),
              give: vm.offer.give ?? t('games.vestaTable.nothing'),
              take: vm.offer.take ?? t('games.vestaTable.nothing'),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            {vm.iAmTradeTarget && (
              <>
                <Button variant="pill" size="xs" disabled={busy} onClick={vm.accept}>
                  {t('games.vesta.accept')}
                </Button>
                <Button variant="pillSecondary" size="xs" disabled={busy} onClick={vm.reject}>
                  {t('games.vesta.reject')}
                </Button>
              </>
            )}
            {vm.iAmProposer && (
              <Button variant="pillSecondary" size="xs" disabled={busy} onClick={vm.withdraw}>
                {t('games.vesta.withdraw')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* The robber is out and wants a target */}
      {vm.robberPending && (
        <p className="rounded-lg border border-lc-green/40 bg-lc-green/10 p-2 text-center text-[11px] text-lc-green" data-testid="vesta-robber-prompt">
          {t('games.vesta.robber')}
        </p>
      )}

      {/* Who to rob */}
      {vm.showSteal && (
        <div className="rounded-lg border border-lc-border p-3" data-testid="vesta-steal">
          <p className="text-[11px] text-lc-white">{t('games.vesta.steal')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vm.stealVictims.map((v) => (
              <div key={v.victim} className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-lc-muted">{seatLabel(v.seat)}:</span>
                {v.resources.map((option) => (
                  <Button
                    variant="outline"
                    size="xs"
                    key={option.resource}
                    disabled={!option.enabled}
                    onClick={() => vm.steal(v.victim, option.resource)}
                  >
                    {RESOURCE_EMOJI[option.resource]}
                  </Button>
                ))}
              </div>
            ))}
            <Button
              variant="pillSecondary"
              size="md"
              onClick={vm.skipSteal}
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
