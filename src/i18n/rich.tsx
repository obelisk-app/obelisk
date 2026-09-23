/**
 * Translated copy with markup inside it.
 *
 * Most strings are plain, and `t()` returning a string is the right shape for
 * them. But a sentence like "Adds a `["t","voice"]` tag" has an element in
 * the middle of it, and the way that was handled — a JSX text node, a
 * `<code>`, another text node — leaves three fragments no translator can
 * reorder. Spanish and Portuguese both put the tag somewhere English
 * doesn't, so the fragments have to become one string with a slot in it.
 *
 * So: one key, `{name}` placeholders, and the nodes supplied at the call
 * site. The whole sentence stays translatable and the markup stays markup.
 *
 *   <p>{rich(t('desktop.channel.voiceHelp'), { tag: <code>…</code> })}</p>
 *
 * A placeholder with no matching node is left as written — visible in the
 * UI rather than silently dropped, because a missing slot is a bug in the
 * dictionary and should look like one.
 */

import { Fragment, type ReactNode } from 'react';

const PLACEHOLDER = /\{(\w+)\}/g;

export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(PLACEHOLDER)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const node = parts[match[1]];
    out.push(node === undefined ? match[0] : <Fragment key={key++}>{node}</Fragment>);
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));

  return out;
}
