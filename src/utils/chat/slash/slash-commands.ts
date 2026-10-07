import { gameCatalog } from '@/lib/games/core/catalog';
import type { MessageKey, Translate } from '@/i18n/keys';

export interface SlashCommandParam {
  name: string;
  /** What the argument is, in the reader's language. */
  descriptionKey: MessageKey;
  kind: 'mention' | 'number' | 'string';
  optional?: boolean;
}

export interface SlashCommand {
  name: string;
  /** A built-in command's description, worded in the reader's language. */
  descriptionKey?: MessageKey;
  /** A bot command's description, as the bot advertised it. */
  description?: string;
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
  if (sec.key === 'obelisk') return 'Obelisk'; // i18n-exempt: the product's name
  return sec.bot ? botLabel(sec.bot, profiles) : sec.key;
}

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

/** Every playable game, "⚛ Chain Reaction, 🏛 Vesta or 🧱 Stacker" in the reader's language. */
export function playableGameNames(locale: string): string {
  const names = gameCatalog().map((g) => `${g.icon} ${g.displayName}`);
  return new Intl.ListFormat(locale, { style: 'long', type: 'disjunction' }).format(names);
}

/** A command's description as the list shows it: a built-in's in the reader's language, a bot's as advertised. */
export function commandDescription(t: Translate, locale: string, cmd: SlashCommand): string {
  if (cmd.descriptionKey === 'chat.slash.play') return t('chat.slash.play', { games: playableGameNames(locale) });
  if (cmd.descriptionKey) return t(cmd.descriptionKey);
  return cmd.description ?? '';
}
