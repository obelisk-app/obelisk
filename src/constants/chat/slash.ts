/**
 * Chat: slash. Values the code in `utils/chat/slash/slash-commands.ts` reads,
 * kept here so every reader imports the one copy.
 */

import type { SlashCommand } from '@/utils/chat/slash/slash-commands';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'zap',
    descriptionKey: 'chat.slash.zap',
    params: [
      { name: 'user', descriptionKey: 'chat.slash.zapUser', kind: 'mention', optional: true },
      { name: 'amount', descriptionKey: 'chat.slash.zapAmount', kind: 'number', optional: true },
    ],
  },
  // `/play` lists the games from the catalog (see `commandDescription`), so
  // adding a game to the registry updates the command instead of leaving it
  // stale, which is exactly what happened when Vesta arrived and this still
  // said "Chain Reaction".
  { name: 'play', descriptionKey: 'chat.slash.play' },
];
