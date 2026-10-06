/**
 * Comments out, everything else in place.
 *
 * Every character of a `//` or `/* *\/` comment becomes a space (newlines
 * stay), so a sentence in a comment is not reported as copy and every
 * finding keeps its line number. A small tokenizer, not a parser: it knows
 * quotes, template literals and regex literals well enough that `//` in a
 * URL string or a regex is not taken for a comment. Quotes end at a newline,
 * so an apostrophe in JSX text ("Don't") cannot swallow the file.
 */

const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '']);

export function stripComments(source: string): string {
  const out = source.split('');
  let i = 0;
  let lastSignificant = '';
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      i += 1;
      while (i < source.length && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
      i += 1;
      lastSignificant = c;
      continue;
    }
    if (c === '`') {
      i += 1;
      while (i < source.length && source[i] !== '`') i += source[i] === '\\' ? 2 : 1;
      i += 1;
      lastSignificant = c;
      continue;
    }
    if (c === '/' && REGEX_BEFORE.has(lastSignificant)) {
      let inClass = false;
      i += 1;
      while (i < source.length && source[i] !== '\n' && (inClass || source[i] !== '/')) {
        if (source[i] === '\\') i += 1;
        else if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        i += 1;
      }
      i += 1;
      lastSignificant = '/';
      continue;
    }
    if (!/\s/.test(c) || c === '\n') lastSignificant = c === '\n' ? lastSignificant : c;
    i += 1;
  }
  return out.join('');
}
