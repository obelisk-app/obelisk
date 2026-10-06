/**
 * Join class names, dropping the falsy ones.
 *
 * Every primitive in this directory accepts `className` for one-off overrides
 * and builds its own classes from a variant table, so a tiny joiner is all
 * that is needed; a conditional-object API would only invite class strings
 * back into call sites.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...parts: ClassValue[]): string {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    out = out ? `${out} ${part}` : part;
  }
  return out;
}
