'use client';

import { useTranslations } from 'next-intl';
import type { SlashCommand } from '@/utils/chat/slash/slash-commands';
import { activeParamIndex, tokenize } from '@/utils/chat/slash/slash-scaffold';

export { activeParamIndex, scaffoldMentionSlotQuery, scaffoldMentionSlotRange } from '@/utils/chat/slash/slash-scaffold';

interface Props {
  command: SlashCommand;
  content: string;
  caret: number;
}

export default function SlashCommandScaffold({ command, content, caret }: Props) {
  const t = useTranslations();
  const params = command.params;
  if (!params || params.length === 0) return null;

  const prefix = `/${command.name}`;
  if (!content.startsWith(prefix)) return null;

  const rest = content.slice(prefix.length);
  if (rest.length === 0) return null;

  const caretInRest = Math.max(0, caret - prefix.length);
  const tokens = tokenize(rest);
  const active = activeParamIndex(rest, caretInRest, params);
  const activeParam = params[active];

  return (
    <div
      className="mb-1 rounded-xl border border-lc-border bg-lc-dark px-3 py-2"
      data-testid="slash-scaffold"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lc-green/15 px-2 py-0.5 font-mono text-xs text-lc-green">
          ⚡ {prefix}
        </span>
        {params.map((p, i) => {
          const token = tokens[i];
          const filled = Boolean(token && token.value);
          const isActive = i === active;
          return (
            <span
              key={p.name}
              data-testid={`slash-slot-${p.name}`}
              data-active={isActive || undefined}
              data-filled={filled || undefined}
              className={
                'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs transition-colors ' +
                (filled
                  ? 'border-lc-border bg-lc-border/60 text-lc-white'
                  : isActive
                    ? 'border-lc-green/40 bg-lc-green/10 text-lc-green'
                    : 'border-lc-border bg-transparent text-lc-muted')
              }
            >
              {filled ? token!.value : p.name}
              {p.optional && !filled && <span className="ml-1 text-[9px] opacity-60">{t('chat.slash.optional')}</span>}
            </span>
          );
        })}
      </div>
      {activeParam && (
        <div className="mt-1.5 text-[11px] text-lc-muted">
          <span className="font-semibold text-lc-white">{activeParam.name}</span>
          <span className="mx-1.5">-</span>
          <span>{t(activeParam.descriptionKey)}</span>
        </div>
      )}
    </div>
  );
}
