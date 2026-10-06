import { gameCatalog } from '@/lib/games/catalog';

export interface SlashCommandParam {
  name: string;
  description: string;
  kind: 'mention' | 'number' | 'string';
  optional?: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
  params?: SlashCommandParam[];
  /** Bot commands: the literal text the bot parses (e.g. `!milugar`). */
  insert?: string;
  /** Set for commands advertised by a bot alive on this relay. */
  bot?: { pubkey: string; name: string };
}

/** One block of the list; `key` is `obelisk`, `recent` or a bot pubkey. */
export interface SlashCommandSection {
  key: string;
  bot?: { pubkey: string; name: string };
  commands: SlashCommand[];
}

/** Resolved kind 0 bits for bots, passed in so rows don't subscribe. */
export type BotProfiles = Readonly<Record<string, { name?: string | null; picture?: string | null }>>;

/** A bot's display name: its resolved kind 0 name, else the name it advertised. */
export function botLabel(bot: { pubkey: string; name: string }, profiles?: BotProfiles): string {
  const p = profiles?.[bot.pubkey];
  return p?.name || bot.name;
}

/** A section's heading: the Recent label, `Obelisk`, or the bot's name. */
export function sectionTitle(sec: SlashCommandSection, recentLabel: string, profiles?: BotProfiles): string {
  if (sec.key === 'recent') return recentLabel;
  if (sec.key === 'obelisk') return 'Obelisk';
  return sec.bot ? botLabel(sec.bot, profiles) : sec.key;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'zap',
    description: 'Send sats to a user in this channel',
    params: [
      { name: 'user', description: 'User to zap (mention, npub, or display name)', kind: 'mention', optional: true },
      { name: 'amount', description: 'Amount in sats', kind: 'number', optional: true },
    ],
  },
  {
    name: 'play',
    // Built from the catalog rather than written out, so adding a game to the
    // registry updates the command instead of leaving this line stale, which
    // is exactly what happened when Vesta arrived and this still said
    // "Chain Reaction".
    description: `Play a game in this channel: ${playableGameNames()}`,
  },
];

export function playableGameNames(): string {
  const names = gameCatalog().map((g) => `${g.icon} ${g.displayName}`);
  if (names.length <= 1) return names[0] ?? 'no games available';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}
