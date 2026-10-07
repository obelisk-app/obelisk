/**
 * Bot slash commands: the chat commands of bots that are alive on a relay,
 * so the composer's `/` picker can list them next to the built-in ones.
 *
 * Source: NIP-78 (kind 30078) replaceable events signed by each bot,
 * published by each bot itself (obelisk-agents lib/commands.mjs).
 *
 * d-tag:   `obelisk:bot-commands:<relayUrl>` - one per relay, like layout
 * t-tag:   `obelisk-bot-commands`
 * cmd:     ["cmd", "!x", description, example] - one per command
 * content: {"v":1,"name":"<bot>","commands":[{command,description,example}]}
 *
 * Bots republish every ~20 min while they run, so `created_at`
 * doubles as a heartbeat: anything older than {@link BOT_ALIVE_SECS} is a
 * bot that stopped and is not shown.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getBridge, getBridgeImpl } from '@/services/nostr-bridge';
import { KIND_NIP78_APP_DATA } from '@/constants/nostr/nip-kinds';
import type { SlashCommand } from '@/utils/chat/slash/slash-commands';
import { BOT_ALIVE_SECS } from '@/constants/relay/bot-commands';

export interface BotCommand {
  /** What the bot actually parses, e.g. `!milugar`. */
  readonly trigger: string;
  readonly description: string | null;
  readonly example: string | null;
}

export interface BotCommandSet {
  readonly pubkey: string;
  /** Fallback label until the bot's kind 0 loads. */
  readonly name: string;
  readonly commands: ReadonlyArray<BotCommand>;
  readonly createdAt: number;
}

function dTags(relayUrl: string): string[] {
  const base = relayUrl.replace(/\/+$/, '');
  return [`obelisk:bot-commands:${base}`, `obelisk:bot-commands:${base}/`];
}

/** `["cmd", "!x", description, example]` tags: same list, queryable form. */
function commandsFromTags(ev: NostrEvent): unknown[] {
  return ev.tags
    .filter((t) => t[0] === 'cmd' && t[1])
    .map((t) => ({ command: t[1], description: t[2] || null, example: t[3] || null }));
}

export function parseBotCommands(ev: NostrEvent): BotCommandSet | null {
  let body: unknown = null;
  try { body = JSON.parse(ev.content); } catch { /* fall back to cmd tags */ }
  const fromJson = body && typeof body === 'object' ? body as { name?: unknown; commands?: unknown } : {};
  const name = fromJson.name;
  const commands = Array.isArray(fromJson.commands) ? fromJson.commands : commandsFromTags(ev);
  if (!Array.isArray(fromJson.commands) && !ev.tags.some((t) => t[0] === 'cmd' || t[0] === 't')) return null;
  const parsed: BotCommand[] = [];
  for (const c of commands) {
    if (!c || typeof c !== 'object') continue;
    const { command, description, example } = c as Record<string, unknown>;
    if (typeof command !== 'string' || !/^\S{2,40}$/.test(command)) continue;
    parsed.push({
      trigger: command,
      description: typeof description === 'string' ? description.slice(0, 200) : null,
      example: typeof example === 'string' ? example.slice(0, 200) : null,
    });
  }
  return {
    pubkey: ev.pubkey,
    name: typeof name === 'string' && name ? name.slice(0, 40) : ev.pubkey.slice(0, 8),
    commands: parsed,
    createdAt: ev.created_at,
  };
}

/** `!ranking-niveles` → `ranking-niveles`: the name typed after `/`. */
export function slashNameFor(trigger: string): string {
  return trigger.replace(/^[!/.]+/, '').toLowerCase();
}

/**
 * Built-in commands first (the app's own `/zap` and `/play` always lead),
 * then every live bot's commands, grouped per bot. A bot command never
 * shadows a built-in one: both show, the built-in on top.
 */
export function mergeSlashCommands(
  builtIn: ReadonlyArray<SlashCommand>,
  bots: ReadonlyArray<BotCommandSet>,
  nowSecs: number = Math.floor(Date.now() / 1000),
): SlashCommand[] {
  const live = bots
    .filter((b) => b.commands.length > 0 && nowSecs - b.createdAt <= BOT_ALIVE_SECS)
    .sort((a, b) => a.name.localeCompare(b.name));
  const fromBots: SlashCommand[] = [];
  for (const bot of live) {
    for (const c of bot.commands) {
      fromBots.push({
        name: slashNameFor(c.trigger),
        description: c.description ?? c.example ?? '',
        insert: c.trigger,
        bot: { pubkey: bot.pubkey, name: bot.name },
      });
    }
  }
  return [...builtIn, ...fromBots];
}

/** Stable id for recents: built-ins by name, bot commands by bot + name. */
export function slashCommandId(cmd: SlashCommand): string {
  return cmd.bot ? `${cmd.bot.pubkey}:${cmd.name}` : `obelisk:${cmd.name}`;
}

/** `all`, `recent`, `obelisk` (built-ins) or a bot pubkey. */
export type SlashFilter = string;

export interface SlashSection {
  /** `recent`, `obelisk` or the bot pubkey (also the rail filter value). */
  readonly key: SlashFilter;
  readonly bot?: { pubkey: string; name: string };
  readonly commands: SlashCommand[];
}

/**
 * Picker sections, Discord-style. Built-ins always lead (`/zap`, `/play`),
 * then recently used bot commands, then one section per bot. `filter`
 * narrows to a single section (the left rail); `all` shows every one.
 */
export function buildSlashSections(
  commands: ReadonlyArray<SlashCommand>,
  query: string,
  recentIds: ReadonlyArray<string>,
  filter: SlashFilter = 'all',
): SlashSection[] {
  const matches = filterSlashCommands(commands, query);
  const builtIn = matches.filter((c) => !c.bot);
  const byId = new Map(matches.map((c) => [slashCommandId(c), c]));
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((c): c is SlashCommand => !!c && !!c.bot);
  const sections: SlashSection[] = [];
  if (builtIn.length) sections.push({ key: 'obelisk', commands: builtIn });
  if (recent.length) sections.push({ key: 'recent', commands: recent });
  const bots = new Map<string, SlashSection>();
  for (const c of matches) {
    if (!c.bot) continue;
    let sec = bots.get(c.bot.pubkey);
    if (!sec) {
      sec = { key: c.bot.pubkey, bot: c.bot, commands: [] };
      bots.set(c.bot.pubkey, sec);
    }
    sec.commands.push(c);
  }
  sections.push(...bots.values());
  return filter === 'all' ? sections : sections.filter((s) => s.key === filter);
}

export function filterSlashCommands(commands: ReadonlyArray<SlashCommand>, query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return commands.filter((c) => c.name.startsWith(q));
}

export function subscribeBotCommands(
  relayUrl: string,
  onChange: (sets: BotCommandSet[]) => void,
): () => void {
  const impl = getBridgeImpl();
  if (!impl) {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void getBridge().then(() => {
      if (!cancelled) unsub = subscribeBotCommands(relayUrl, onChange);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }
  const byBot = new Map<string, BotCommandSet>();
  const filter: Filter = {
    kinds: [KIND_NIP78_APP_DATA],
    '#d': dTags(relayUrl),
    since: Math.floor(Date.now() / 1000) - BOT_ALIVE_SECS,
  };
  return impl.subscribeFilterWatched(filter, (ev) => {
    const prev = byBot.get(ev.pubkey);
    if (prev && prev.createdAt >= ev.created_at) return;
    const set = parseBotCommands(ev);
    if (!set) return;
    byBot.set(ev.pubkey, set);
    onChange([...byBot.values()]);
  }, { relays: [relayUrl] });
}

