'use client';

import { SLASH_COMMANDS, type SlashCommand, type SlashCommandParam } from './SlashCommandAutocomplete';

interface Props {
  command: SlashCommand;
  content: string;
  caret: number;
}

function tokenize(rest: string): { value: string; start: number; end: number }[] {
  const tokens: { value: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && /\s/.test(rest[i])) i++;
    if (i >= rest.length) break;
    const start = i;
    while (i < rest.length && !/\s/.test(rest[i])) i++;
    tokens.push({ value: rest.slice(start, i), start, end: i });
  }
  return tokens;
}

export function activeParamIndex(
  rest: string,
  caretInRest: number,
  params: SlashCommandParam[],
): number {
  const tokens = tokenize(rest);
  for (let i = 0; i < tokens.length; i++) {
    if (caretInRest >= tokens[i].start && caretInRest <= tokens[i].end) {
      return Math.min(i, params.length - 1);
    }
  }
  return Math.min(tokens.length, params.length - 1);
}

export function scaffoldMentionSlotQuery(content: string, caret: number): string | null {
  const m = /^\/([a-zA-Z]+)(?:\s|$)/.exec(content);
  if (!m) return null;
  const cmd = SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase());
  if (!cmd || !cmd.params || cmd.params.length === 0) return null;

  const prefix = `/${cmd.name}`;
  if (caret < prefix.length) return null;
  const rest = content.slice(prefix.length);
  const caretInRest = caret - prefix.length;
  if (caretInRest <= 0) return null;

  const tokens = tokenize(rest);
  const active = activeParamIndex(rest, caretInRest, cmd.params);
  if (cmd.params[active].kind !== 'mention') return null;

  const tok = tokens[active];
  if (tok && caretInRest >= tok.start && caretInRest <= tok.end) {
    return rest.slice(tok.start, caretInRest).replace(/^@/, '');
  }
  if (!tok || caretInRest <= tok.start) return '';
  return null;
}

/**
 * Absolute character range of the active mention-slot's existing token, or
 * `null` when the caret isn't sitting in such a slot. Used by the mention
 * picker so that selecting a member replaces the partial text already typed
 * in the slot (e.g. `/zap dum` → `/zap nostr:npub1…`) instead of appending
 * a second token after it.
 */
export function scaffoldMentionSlotRange(
  content: string,
  caret: number,
): { start: number; end: number } | null {
  const m = /^\/([a-zA-Z]+)(?:\s|$)/.exec(content);
  if (!m) return null;
  const cmd = SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase());
  if (!cmd || !cmd.params || cmd.params.length === 0) return null;

  const prefix = `/${cmd.name}`;
  if (caret < prefix.length) return null;
  const rest = content.slice(prefix.length);
  const caretInRest = caret - prefix.length;
  if (caretInRest <= 0) return null;

  const tokens = tokenize(rest);
  const active = activeParamIndex(rest, caretInRest, cmd.params);
  if (cmd.params[active].kind !== 'mention') return null;

  const tok = tokens[active];
  if (tok && caretInRest >= tok.start && caretInRest <= tok.end) {
    return { start: prefix.length + tok.start, end: prefix.length + tok.end };
  }
  return null;
}

export default function SlashCommandScaffold({ command, content, caret }: Props) {
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
              {p.optional && !filled && <span className="ml-1 text-[9px] opacity-60">opt</span>}
            </span>
          );
        })}
      </div>
      {activeParam && (
        <div className="mt-1.5 text-[11px] text-lc-muted">
          <span className="font-semibold text-lc-white">{activeParam.name}</span>
          <span className="mx-1.5">—</span>
          <span>{activeParam.description}</span>
        </div>
      )}
    </div>
  );
}
