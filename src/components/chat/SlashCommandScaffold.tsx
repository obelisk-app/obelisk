'use client';

import { SLASH_COMMANDS, type SlashCommand, type SlashCommandParam } from './SlashCommandAutocomplete';

interface Props {
  command: SlashCommand;
  // Raw content of the textarea. Expected to start with `/<commandName>`.
  content: string;
  // Cursor position inside `content`. Used to decide which param is active.
  caret: number;
}

/**
 * Parse the content *after* `/<command>` into whitespace-separated tokens,
 * preserving positions. Mirrors Discord's slash-command "scaffold" that
 * shows one pill per parameter.
 */
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

/**
 * If the caret sits inside a slash-command parameter slot declared as
 * `kind: 'mention'`, return the partial query (token up to the caret, with
 * any leading `@` stripped). Returns `null` when the caret is not in a
 * mention slot, so callers can decide not to open the picker.
 */
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
  // Caret sits on whitespace right before the slot's token — show all members.
  if (!tok || caretInRest <= tok.start) return '';
  return null;
}

export function activeParamIndex(
  rest: string,
  caretInRest: number,
  params: SlashCommandParam[],
): number {
  const tokens = tokenize(rest);
  // If the cursor sits inside a token, that token's index wins; otherwise
  // we're on the next (unfilled) slot.
  for (let i = 0; i < tokens.length; i++) {
    if (caretInRest >= tokens[i].start && caretInRest <= tokens[i].end) {
      return Math.min(i, params.length - 1);
    }
  }
  return Math.min(tokens.length, params.length - 1);
}

export default function SlashCommandScaffold({ command, content, caret }: Props) {
  const params = command.params;
  if (!params || params.length === 0) return null;

  const prefix = `/${command.name}`;
  if (!content.startsWith(prefix)) return null;

  const rest = content.slice(prefix.length);
  // Only show once the user has committed to the command (a space after the
  // name, or at least one arg token typed).
  if (rest.length === 0) return null;

  const caretInRest = Math.max(0, caret - prefix.length);
  const tokens = tokenize(rest);
  const active = activeParamIndex(rest, caretInRest, params);
  const activeParam = params[active];

  return (
    <div
      className="mx-4 mb-1 px-3 py-2 bg-lc-dark border border-lc-border rounded-xl"
      data-testid="slash-scaffold"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-lc-green/15 text-lc-green text-xs font-mono">
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
                'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border transition-colors ' +
                (filled
                  ? 'bg-lc-border/60 text-lc-white border-lc-border'
                  : isActive
                    ? 'bg-lc-green/10 text-lc-green border-lc-green/40'
                    : 'bg-transparent text-lc-muted border-lc-border')
              }
            >
              {filled ? token!.value : p.name}
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
