import { botLabel, type BotProfiles, type SlashCommand, type SlashCommandSection } from './slash-commands';

/** One command row of the slash list. `index` counts across every section, as the keyboard selection does. */
export interface SlashRow {
  readonly key: string;
  readonly cmd: SlashCommand;
  readonly index: number;
  /** The bot's name; null for Obelisk's own commands. */
  readonly botLabel: string | null;
  readonly picture: string | null | undefined;
}

/** The slash list's sections with their rows numbered across all of them. */
export function slashSectionRows(sections: ReadonlyArray<SlashCommandSection>, botProfiles?: BotProfiles) {
  let flat = 0;
  return sections.map((section) => ({
    section,
    rows: section.commands.map((cmd): SlashRow => ({
      key: `${section.key}:${cmd.bot?.pubkey ?? ''}:${cmd.name}`,
      cmd,
      index: flat++,
      botLabel: cmd.bot ? botLabel(cmd.bot, botProfiles) : null,
      picture: cmd.bot ? botProfiles?.[cmd.bot.pubkey]?.picture : null,
    })),
  }));
}

/** The rail's items: which source is the filter, and what a press on it sets (the source, or back to all). */
export function slashRailItems(rail: ReadonlyArray<SlashCommandSection>, filter: string) {
  return rail.map((section) => {
    const active = filter === section.key;
    return { section, active, next: active ? 'all' : section.key };
  });
}

/** A mouse-down handler that runs `fn` without taking focus from the composer. */
export function keepingFocus(fn: () => void) {
  return (e: { preventDefault(): void }) => {
    e.preventDefault();
    fn();
  };
}
