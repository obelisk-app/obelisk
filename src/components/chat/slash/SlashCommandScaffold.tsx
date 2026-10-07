'use client';

import { useTranslations } from 'next-intl';
import type { SlashCommand } from '@/utils/chat/slash/slash-commands';
import { scaffoldSlots } from '@/utils/chat/slash/slash-scaffold';

interface Props {
  command: SlashCommand;
  content: string;
  caret: number;
}

export default function SlashCommandScaffold({ command, content, caret }: Props) {
  const t = useTranslations();
  const scaffold = scaffoldSlots(command, content, caret);
  if (!scaffold) return null;

  return (
    <div
      className="mb-1 rounded-xl border border-lc-border bg-lc-dark px-3 py-2"
      data-testid="slash-scaffold"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lc-green/15 px-2 py-0.5 font-mono text-xs text-lc-green">
          ⚡ {scaffold.prefix}
        </span>
        {scaffold.slots.map((slot) => (
          <span
            key={slot.name}
            data-testid={`slash-slot-${slot.name}`}
            data-active={slot.active || undefined}
            data-filled={slot.filled || undefined}
            className={
              'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs transition-colors ' +
              (slot.filled
                ? 'border-lc-border bg-lc-border/60 text-lc-white'
                : slot.active
                  ? 'border-lc-green/40 bg-lc-green/10 text-lc-green'
                  : 'border-lc-border bg-transparent text-lc-muted')
            }
          >
            {slot.text}
            {slot.optional && !slot.filled && <span className="ml-1 text-[9px] opacity-60">{t('chat.slash.optional')}</span>}
          </span>
        ))}
      </div>
      {scaffold.activeParam && (
        <div className="mt-1.5 text-[11px] text-lc-muted">
          <span className="font-semibold text-lc-white">{scaffold.activeParam.name}</span>
          <span className="mx-1.5">-</span>
          <span>{t(scaffold.activeParam.descriptionKey)}</span>
        </div>
      )}
    </div>
  );
}
