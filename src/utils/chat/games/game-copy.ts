/**
 * The games' copy that the engines hand over as data: a game's pitch, the
 * line under its name in the picker, and a seat's final score. `src/lib`
 * never words anything, so the table and the picker call these with their
 * own `t`.
 */
import type { GameInfo } from '@/lib/games/catalog';
import type { Score, ScoreDetail } from '@/lib/games/standings';
import type { MessageKey, Translate } from '@/i18n/keys';

const DESCRIPTIONS: Record<string, MessageKey> = {
  'chain-reaction': 'games.meta.chainReaction',
  vesta: 'games.meta.vesta',
  stacker: 'games.meta.stacker',
};

/** One line on what the game is, or null for a game this client does not know. */
export function gameDescription(t: Translate, type: string): string | null {
  const key = DESCRIPTIONS[type];
  return key ? t(key) : null;
}

/** "2–8 players · 45s turns": the line under a game's name in the picker. */
export function gameSummary(t: Translate, info: GameInfo): string {
  const players = info.minPlayers === info.maxPlayers
    ? t('games.summary.players', { count: info.minPlayers })
    : t('games.summary.playersRange', { min: info.minPlayers, max: info.maxPlayers });
  if (info.realtime) return t('games.summary.realtime', { players });
  return info.defaultTurnTimeoutS > 0
    ? t('games.summary.turns', { players, seconds: info.defaultTurnTimeoutS })
    : t('games.summary.noClock', { players });
}

/** A seat's final score as the results table and the splash show it. */
export function scoreLabel(t: Translate, score: Score): string {
  switch (score.kind) {
    case 'vp': return t('games.score.vp', { count: score.vp });
    case 'stacker': return t('games.score.stacker', { attacks: score.attacks, lines: score.lines });
    case 'orbs': return t('games.score.orbs', { count: score.orbs });
    case 'out': return t('games.score.out');
    case 'winner': return t('games.score.winner');
    default: return '-';
  }
}

/** What a game's score means, shown once under the standings. */
export function scoreDetail(t: Translate, detail: ScoreDetail): string {
  return t(`games.score.detail.${detail}`);
}
