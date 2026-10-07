'use client';

import { memo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ObeliskIcon from '@/assets/brand/ObeliskIcon';
import { commandDescription, type SlashCommand } from '@/utils/chat/slash/slash-commands';
import { keepingFocus } from '@/utils/chat/slash/slash-rows';
import { BotAvatar } from './BotAvatar';
import OptionRow from '@/components/ui/forms/OptionRow';

/** One command in the slash list; memoised, so moving the selection re-renders two rows, not all of them. */
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
      onMouseDown={keepingFocus(() => onSelect(cmd))}
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
