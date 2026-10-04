'use client';

import { memo, useCallback, useEffect, useRef } from 'react';
import { gameCatalog } from '@/lib/games/catalog';
import { RecentIcon } from './EmojiPicker';
import ObeliskIcon from '../ObeliskIcon';
import { useTranslation } from '@/i18n/context';

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

interface Props {
  /** Sections to list (already narrowed by `filter`). */
  sections: SlashCommandSection[];
  /** Every source, for the left rail — independent of query and filter. */
  rail?: SlashCommandSection[];
  filter?: string;
  onFilter?: (filter: string) => void;
  /** Index into the flattened `sections` commands. */
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  botProfiles?: BotProfiles;
}

function botLabel(bot: { pubkey: string; name: string }, profiles?: BotProfiles): string {
  const p = profiles?.[bot.pubkey];
  return p?.name || bot.name;
}

function BotAvatar({ picture, size }: { picture?: string | null; size: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" width={36} height={36} loading="lazy" decoding="async" className={`${cls} shrink-0 rounded-full object-cover`} />;
  }
  return <span className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-lc-border text-sm`}>🤖</span>;
}

function sectionTitle(sec: SlashCommandSection, recentLabel: string, profiles?: BotProfiles) {
  if (sec.key === 'recent') return recentLabel;
  if (sec.key === 'obelisk') return 'Obelisk';
  return sec.bot ? botLabel(sec.bot, profiles) : sec.key;
}

function RailIcon({ sec, profiles }: { sec: SlashCommandSection; profiles?: BotProfiles }) {
  if (sec.key === 'recent') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-border text-lc-white"><RecentIcon /></span>;
  if (sec.key === 'obelisk') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-black text-lc-green"><ObeliskIcon className="h-6 w-6" /></span>;
  return <BotAvatar picture={profiles?.[sec.key]?.picture} size="md" />;
}

const CommandRow = memo(function CommandRow({
  cmd, index, selected, label, picture, onSelect, registerRef,
}: {
  cmd: SlashCommand;
  index: number;
  selected: boolean;
  label: string;
  picture?: string | null;
  onSelect: (cmd: SlashCommand) => void;
  registerRef: (index: number, el: HTMLButtonElement | null) => void;
}) {
  const required = (cmd.params ?? []).filter((p) => !p.optional);
  const optional = (cmd.params ?? []).filter((p) => p.optional);
  return (
    <button
      ref={(el) => registerRef(index, el)}
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${selected ? 'bg-lc-border/60' : 'hover:bg-lc-border/40'}`}
      data-testid="slash-option"
    >
      {cmd.bot ? <BotAvatar picture={picture} size="sm" /> : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lc-black text-lc-green">
          <ObeliskIcon className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm text-lc-white">/{cmd.name}</span>
          {required.map((p) => (
            <span key={p.name} className="rounded bg-lc-border/70 px-1.5 py-0.5 text-[10px] font-mono text-lc-muted">
              {p.name}
            </span>
          ))}
          {optional.length > 0 && (
            <span className="text-[10px] text-lc-muted">+{optional.length} optional</span>
          )}
        </span>
        {cmd.description && (
          <span className="block truncate text-xs text-lc-muted">{cmd.description}</span>
        )}
      </span>
      <span className="max-w-[9rem] shrink-0 truncate text-xs text-lc-muted">{label}</span>
    </button>
  );
});

export default function SlashCommandAutocomplete({
  sections, rail, filter = 'all', onFilter, selectedIndex, onSelect, onClose, botProfiles,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Stable callbacks so memoized rows only re-render when their own props
  // change (selection moves two rows, not the whole list).
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });
  const select = useCallback((cmd: SlashCommand) => onSelectRef.current(cmd), []);
  const registerRef = useCallback((i: number, el: HTMLButtonElement | null) => { itemRefs.current[i] = el; }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const showRail = !!rail && rail.length > 1 && !!onFilter;
  if (sections.length === 0 && !showRail) return null;

  let flat = 0;
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 flex max-h-96 overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-lg"
      data-testid="slash-autocomplete"
    >
      {showRail && (
        <div className="flex shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-r border-lc-border bg-lc-black/40 p-2" data-testid="slash-rail">
          {rail!.map((sec) => {
            const active = filter === sec.key;
            return (
              <button
                key={sec.key}
                type="button"
                title={sectionTitle(sec, t('slash.recent'), botProfiles)}
                aria-pressed={active}
                onMouseDown={(e) => { e.preventDefault(); onFilter!(active ? 'all' : sec.key); }}
                className={`rounded-full ring-2 transition-opacity ${active ? 'ring-lc-green opacity-100' : 'ring-transparent opacity-70 hover:opacity-100'}`}
                data-testid="slash-rail-item"
              >
                <RailIcon sec={sec} profiles={botProfiles} />
              </button>
            );
          })}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain [contain:content]">
        {sections.length === 0 && (
          <div className="px-3 py-4 text-xs text-lc-muted">{t('slash.noMatch')}</div>
        )}
        {sections.map((sec) => (
          <div key={sec.key}>
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-lc-dark px-3 pb-1 pt-2 text-xs font-semibold text-lc-white">
              {sec.key === 'recent' && <RecentIcon className="h-4 w-4" />}
              {sectionTitle(sec, t('slash.recent'), botProfiles)}
            </div>
            {sec.commands.map((cmd) => {
              const i = flat++;
              return (
                <CommandRow
                  key={`${sec.key}:${cmd.bot?.pubkey ?? ''}:${cmd.name}`}
                  cmd={cmd}
                  index={i}
                  selected={i === selectedIndex}
                  label={cmd.bot ? botLabel(cmd.bot, botProfiles) : 'Obelisk'}
                  picture={cmd.bot ? botProfiles?.[cmd.bot.pubkey]?.picture : null}
                  onSelect={select}
                  registerRef={registerRef}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
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
    // registry updates the command instead of leaving this line stale — which
    // is exactly what happened when Vesta arrived and this still said
    // "Chain Reaction".
    description: `Play a game in this channel — ${playableGameNames()}`,
  },
];

function playableGameNames(): string {
  const names = gameCatalog().map((g) => `${g.icon} ${g.displayName}`);
  if (names.length <= 1) return names[0] ?? 'no games available';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}
