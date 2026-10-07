'use client';

import { MUSIC_CREDIT } from '@/lib/games/stacker/audio';
import { useStackerTable, type StackerTableInput } from '@/hooks/games/stacker/useStackerTable';
import StackerBoard from './StackerBoard';
import PieceChip from './PieceChip';
import StackerStat from './StackerStat';
import StackerOpponent from './StackerOpponent';
import StackerKeysPanel from './StackerKeysPanel';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';

export interface StackerTableProps extends StackerTableInput {
  seatLabel: (seatId: string) => string;
}

/**
 * A match: your board at full speed, everyone else's as a meter.
 *
 * Opponents are deliberately coarse. Their real boards run on their own
 * machines and only reach us through checkpoints every few seconds, and drawing a
 * detailed board that is seconds stale would be a lie, so we show the one thing
 * that stays true between updates: how buried they are.
 */
export default function StackerTable({ seatLabel, ...input }: StackerTableProps) {
  const t = useTranslations();
  const vm = useStackerTable(input);
  const { runner, stats, banner } = vm;
  const { match } = input;

  return (
    <div className="space-y-3" data-testid="stacker-table">
      <div className="flex items-start justify-center gap-3">
        {/* Left rail: hold and the numbers that matter */}
        <div className="flex w-[68px] shrink-0 flex-col gap-2">
          <div className="rounded-lg border border-lc-border bg-lc-black/40 p-1.5">
            <PieceChip kind={runner.state.hold} label={t('games.hold')} dim={!runner.state.hold} />
          </div>
          <StackerStat label={t('games.sent')} value={stats.attacksSent} accent="#b4f953" testId="stacker-sent" />
          <StackerStat label={t('games.lines')} value={stats.linesCleared} />
          <StackerStat label={t('games.level')} value={stats.level} accent="#22d3ee" testId="stacker-level" />
          {stats.combo > 1 && <StackerStat label={t('games.combo')} value={`${stats.combo}×`} accent="#facc15" />}
          {stats.backToBack > 0 && <StackerStat label="B2B" value={stats.backToBack} accent="#a855f7" />}
        </div>

        {/* Board, with the incoming-garbage meter running up its left side */}
        <div className="relative flex items-stretch gap-1.5">
          <div
            className="flex w-2 flex-col-reverse overflow-hidden rounded-full bg-white/5"
            title={t('games.stacker.linesIncoming', { count: stats.incoming })}
            data-testid="stacker-garbage-meter"
          >
            <div
              className="w-full rounded-full bg-gradient-to-t from-red-600 to-red-400 transition-[height] duration-150 ease-out"
              style={{ height: `${vm.meterPercent}%` }}
            />
          </div>

          <StackerBoard runner={runner} cell={vm.cell} dimmed={vm.dimmed} />

          {/* Clear banner: brief, centred, never in the way of the stack */}
          {banner && (
            <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
              <span
                className="cr-win-title rounded-lg bg-black/70 px-3 py-1 text-center text-sm font-black tracking-wide"
                style={{ color: vm.bannerColor }}
                data-testid="stacker-banner"
              >
                {banner.spin ? 'SPIN' : banner.lines === 4 ? 'QUAD' : `${banner.lines}×`}
                {banner.attack > 0 && <span className="ml-1 text-lc-white">+{banner.attack}</span>}
              </span>
            </div>
          )}

          {vm.showDead && (
            <div className="absolute inset-0 flex items-center justify-center" data-testid="stacker-dead">
              <span className="rounded-lg bg-black/80 px-4 py-2 text-base font-black tracking-wide text-red-400">
                {t('games.toppedOut')}
              </span>
            </div>
          )}
        </div>

        {/* Right rail: what's coming */}
        <div className="flex w-[68px] shrink-0 flex-col gap-1.5">
          <div className="rounded-lg border border-lc-border bg-lc-black/40 p-1.5">
            <PieceChip kind={runner.state.queue[0] ?? null} label={t('games.next')} />
            <div className="mt-1 space-y-1 opacity-80">
              {runner.state.queue.slice(1, 5).map((kind, i) => (
                <PieceChip key={`${kind}-${i}`} kind={kind} dim />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Opponents */}
      {vm.hasOpponents && (
        <div className="flex flex-wrap items-end justify-center gap-3" data-testid="stacker-opponents">
          {vm.opponents.map((o) => (
            <StackerOpponent key={o.seat} seat={o.seat} progress={o.progress} name={seatLabel(o.seat)} cell={vm.miniCell} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-lc-muted">
        <Button
          variant="outlinePill"
          size="xs"
          onClick={vm.openKeys}
          data-testid="stacker-keys-open"
        >
          {t('games.stacker.controls')}
        </Button>
        <Button
          variant="outlinePill"
          size="xs"
          onClick={vm.toggleMuted}
          data-testid="stacker-mute"
        >
          {t(vm.muted ? 'games.stacker.muted' : 'games.stacker.sound')}
        </Button>
        {!vm.muted && (
          <a
            href={MUSIC_CREDIT.source}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] text-lc-muted underline decoration-dotted hover:text-lc-white"
            title={t('games.stacker.credit', { track: vm.track, author: MUSIC_CREDIT.author })}
            data-testid="stacker-music-credit"
          >
            ♫ {vm.track} - {MUSIC_CREDIT.author}
          </a>
        )}
      </div>

      {vm.keysOpen && <StackerKeysPanel onClose={vm.closeKeys} />}

      {match.over && (
        <p className="text-center text-xs text-lc-white" data-testid="stacker-result">
          {match.winner
            ? t('games.stacker.lastStanding', { name: seatLabel(match.winner) })
            : t('games.stacker.allToppedOut')}
        </p>
      )}
    </div>
  );
}
