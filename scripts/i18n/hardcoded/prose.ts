/**
 * Is this prose a reader would notice, rather than a token?
 *
 * The two-letter floor plus "has a space or starts capitalised" is what
 * separates "Add relay" from `px`, `wss`, `npub1…` and `{count}`.
 */

/**
 * Source that the crude JSX-text regex swallows: a generic parameter
 * (`Promise<void>` reads as `>Promise<`), a ternary or a `&&` guard split
 * across lines. None of it is copy.
 */
const CODE_SHAPED = /===|!==|&&|\|\||=>|\?\s*\(|\($/;

/** Type names the generic-parameter case produces most often. */
const TYPE_NAMES = new Set([
  'Promise', 'Partial', 'Record', 'Array', 'Map', 'Set', 'Readonly',
  'Omit', 'Pick', 'Awaited', 'ReturnType',
]);

/** CSS the object and fallback rules over-match: `var(--x, #fff)`, `transform 0.1s ease-out`. */
const CSS_SHAPED = /^(?:var|rgba?|hsla?|calc|url)\(|^(?:transform|opacity|color|background|width|height)\s[\d.]+m?s\b|^[\d.]+(?:px|rem|em|%)(?:\s|$)|^#[0-9a-f]{3,8}\b/i;

/**
 * Names that are the same in every language: the product, its makers and
 * the clients and protocols it talks to. Exact matches only; a sentence
 * containing one is still prose.
 */
const BRANDS = new Set([
  'Obelisk', 'La Crypta', 'Nostr', 'Nostr WoT', 'QuantaKrypto', 'GitHub', 'Primal', 'Damus',
  'Amethyst', 'Snort', 'Coracle', 'Iris', 'Lightning', 'Bitcoin', 'Blossom', 'Vesta', 'Stacker',
  'Chain Reaction', 'English', 'Español', 'Português',
]);

/** Directives and identifiers that look like words. */
const IDENTIFIER = /^(?:use (?:client|server|strict)|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+)$/;

/** Every token lowercase and class-shaped, at least one with a dash: a Tailwind list. */
function isClassList(text: string): boolean {
  const tokens = text.split(/\s+/);
  return tokens.length > 1
    && tokens.every((t) => /^[!-]?[a-z0-9:/_\-[\]().,%#&>*+=']+$/.test(t))
    && tokens.some((t) => /[-:[]/.test(t));
}

export function looksLikeProse(value: string): boolean {
  const text = value.trim();
  if (text.length < 3) return false;
  if (BRANDS.has(text) || IDENTIFIER.test(text) || isClassList(text)) return false;
  if (CODE_SHAPED.test(text)) return false;
  if (TYPE_NAMES.has(text)) return false;
  if (CSS_SHAPED.test(text)) return false;
  // Short acronyms: SFU, GIF, B2B, PWA. A translator has nothing to do
  // with them, and they are the same word in every language we ship.
  if (/^[A-Z0-9-]+$/.test(text)) return false;
  // Pure interpolation, or a fragment of one.
  if (/^[{}]/.test(text) || /^\{.*\}$/.test(text)) return false;
  // Identifiers, URLs, protocol words, file paths, message keys.
  if (/^(?:wss?|https?|data|blob|mailto|nostr):/.test(text)) return false;
  if (/^[a-z0-9_-]+$/.test(text)) return false;
  if (/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_$-]+)+$/.test(text)) return false;
  if (/^[@#./$]/.test(text)) return false;
  // Needs actual letters.
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 2) return false;
  // Prose has a space, or begins as a sentence does.
  return text.includes(' ') || /^[A-Z]/.test(text);
}
