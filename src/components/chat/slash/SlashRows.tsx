'use client';

import { memo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ObeliskIcon from '@/components/ui/icons/ObeliskIcon';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { RecentIcon } from '../picker/RecentIcon';
import { commandDescription, type BotProfiles, type SlashCommand, type SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import OptionRow from '@/components/ui/forms/OptionRow';

// CommandRow comes first: the hook-order guard reads a file top-down and
// does not see `memo(function ...)` as a new component.
export const CommandRow = memo(function CommandRow({
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
  const t = useTranslations();
  const locale = useLocale();
  const description = commandDescription(t, locale, cmd);
  const required = (cmd.params ?? []).filter((p) => !p.optional);
  const optional = (cmd.params ?? []).filter((p) => p.optional);
  return (
    <OptionRow
      ref={(el) => registerRef(index, el)}
      active={selected}
      onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
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
            <span className="text-[10px] text-lc-muted">{t('chat.slash.optionalCount', { count: optional.length })}</span>
          )}
        </span>
        {description && (
          <span className="block truncate text-xs text-lc-muted">{description}</span>
        )}
      </span>
      <span className="max-w-[9rem] shrink-0 truncate text-xs text-lc-muted">{label}</span>
    </OptionRow>
  );
});

export function BotAvatar({ picture, size }: { picture?: string | null; size: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  if (picture) {
    return <RemoteImage src={picture} alt="" width={36} height={36} decoding="async" className={`${cls} shrink-0 rounded-full object-cover`} />;
  }
  return <span className={`flex ${cls} shrink-0 items-center justify-center rounded-full bg-lc-border text-sm`}>🤖</span>;
}

export function RailIcon({ sec, profiles }: { sec: SlashCommandSection; profiles?: BotProfiles }) {
  if (sec.key === 'recent') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-border text-lc-white"><RecentIcon /></span>;
  if (sec.key === 'obelisk') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-black text-lc-green"><ObeliskIcon className="h-6 w-6" /></span>;
  return <BotAvatar picture={profiles?.[sec.key]?.picture} size="md" />;
}
