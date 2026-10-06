import type { CRSizeKey } from '@/lib/games/chain-reaction';
import { normalizeSeed } from '@/lib/games/vesta/resume';
import type { GameInfo } from '@/lib/games/catalog';

export const TIMEOUTS: Array<{ label: string; seconds: number }> = [
  { label: 'No clock', seconds: 0 },
  { label: '30s', seconds: 30 },
  { label: '45s', seconds: 45 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
];

export type ResumeSave = { data: unknown; players: number; name: string };

/** The `opts` a new table is created with, per game type. */
export function gameCreateOptions(
  type: GameInfo['type'],
  { resume, seed, size }: { resume: ResumeSave | null; seed: string; size: CRSizeKey },
): Record<string, unknown> {
  return type === 'vesta'
    ? (resume ? { resume: resume.data } : { seed: normalizeSeed(seed) })
    : type === 'chain-reaction'
      ? { size }
      // Stacker: the seed decides the piece order every player receives,
      // so it is the one thing the whole match has to agree on.
      : type === 'stacker'
        ? { seed: normalizeSeed(seed) }
        : {};
}

/** The player counts offered for "on this machine". */
export function localPlayerChoices(info: GameInfo): number[] {
  return info.realtime
    // Real-time games run every board at once, so there is no
    // keyboard to pass: the only thing "on this machine" can mean is
    // a solo run.
    ? [1]
    : Array.from(
        { length: info.maxPlayers - info.minPlayers + 1 },
        (_, i) => info.minPlayers + i,
      );
}
