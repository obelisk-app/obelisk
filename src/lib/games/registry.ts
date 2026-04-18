import type { GameDefinition } from './types';
import { ticTacToe } from './tic-tac-toe';
import { chainReaction } from './chain-reaction';
import { chess } from './chess';

export const GAMES: Record<string, GameDefinition> = {
  [ticTacToe.type]: ticTacToe,
  [chainReaction.type]: chainReaction,
  [chess.type]: chess,
};

export function getGameDef(type: string): GameDefinition | null {
  return GAMES[type] ?? null;
}

export function listGames() {
  return Object.values(GAMES).map((g) => ({
    type: g.type,
    displayName: g.displayName,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    defaultTurnTimeoutS: g.defaultTurnTimeoutS,
  }));
}
