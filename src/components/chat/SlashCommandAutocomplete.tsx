'use client';

import { useEffect, useRef } from 'react';
import { gameCatalog } from '@/lib/games/catalog';
import { useUserMetadata } from '@/lib/nostr-bridge/stores';

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

interface Props {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export default function SlashCommandAutocomplete({ commands, selectedIndex, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  if (commands.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-80 overflow-y-auto rounded-xl border border-lc-border bg-lc-dark shadow-lg"
      data-testid="slash-autocomplete"
    >
      {commands.map((cmd, i) => {
        const required = (cmd.params ?? []).filter((p) => !p.optional);
        const optional = (cmd.params ?? []).filter((p) => p.optional);
        return (
          <button
            key={cmd.bot ? `${cmd.bot.pubkey}:${cmd.name}` : cmd.name}
            ref={(el) => { itemRefs.current[i] = el; }}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
              i === selectedIndex ? 'bg-lc-border/60' : 'hover:bg-lc-border/40'
            }`}
            data-testid="slash-option"
          >
            {cmd.bot ? <BotAvatar pubkey={cmd.bot.pubkey} /> : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lc-green/20 text-lc-green">
                {cmd.name === 'play' ? '🎮' : '⚡'}
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
            <span className="max-w-[9rem] shrink-0 truncate text-xs text-lc-muted">
              {cmd.bot ? <BotName pubkey={cmd.bot.pubkey} fallback={cmd.bot.name} /> : 'Obelisk'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BotAvatar({ pubkey }: { pubkey: string }) {
  const meta = useUserMetadata(pubkey);
  if (meta?.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={meta.picture} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lc-border text-sm">🤖</span>
  );
}

function BotName({ pubkey, fallback }: { pubkey: string; fallback: string }) {
  const meta = useUserMetadata(pubkey);
  return <>{meta?.displayName || meta?.name || fallback}</>;
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
