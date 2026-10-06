import { SLASH_COMMANDS, type SlashCommandParam } from './slash-commands';

/** The whitespace-separated tokens of a command's argument text, with their offsets. */
export function tokenize(rest: string): { value: string; start: number; end: number }[] {
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
