/**
 * Does a string read as the wrong language? A function-word count: SEO copy
 * is short, but even a 60-character title carries two or three of these,
 * and they are words no other of our languages uses. Brand and protocol
 * terms (Nostr, Discord, NIP-29, relay) are not counted, so a Spanish
 * sentence that names them still reads as Spanish.
 */

const WORDS: Record<'en' | 'es' | 'pt', Set<string>> = {
  en: new Set(['the', 'and', 'with', 'your', 'you', 'for', 'of', 'to', 'is', 'are', 'how', 'what', 'from', 'on', 'in', 'no', 'without', 'this', 'that', 'it', 'its', 'or', 'by', 'about', 'who', 'which', 'every', 'any']),
  es: new Set(['el', 'los', 'las', 'del', 'con', 'para', 'tu', 'tus', 'que', 'una', 'por', 'sin', 'cómo', 'qué', 'es', 'son', 'en', 'y', 'o', 'lo', 'al', 'sus', 'podés', 'tenés', 'más', 'cada', 'quién', 'nadie']),
  pt: new Set(['o', 'os', 'da', 'dos', 'das', 'com', 'para', 'seu', 'sua', 'seus', 'que', 'uma', 'por', 'sem', 'como', 'é', 'são', 'em', 'e', 'ou', 'no', 'na', 'nos', 'ao', 'mais', 'cada', 'você', 'não', 'ninguém']),
};

/** Words shared by two languages carry no signal. */
const SHARED = new Set(['para', 'que', 'por', 'cada', 'como', 'e', 'o', 'no']);

export type Lang = keyof typeof WORDS;

export function languageScores(text: string): Record<Lang, number> {
  const tokens = text.toLowerCase().normalize('NFC').split(/[^\p{L}]+/u).filter(Boolean);
  const score: Record<Lang, number> = { en: 0, es: 0, pt: 0 };
  for (const t of tokens) {
    if (SHARED.has(t)) continue;
    for (const l of Object.keys(WORDS) as Lang[]) if (WORDS[l].has(t)) score[l] += 1;
  }
  return score;
}

/** The language a string clearly reads as, when it is not `expected`; null when it fits or is too short to tell. */
export function wrongLanguage(text: string, expected: Lang): Lang | null {
  const s = languageScores(text);
  let best: Lang = expected;
  for (const l of Object.keys(s) as Lang[]) if (s[l] > s[best]) best = l;
  if (best === expected) return null;
  return s[best] >= 2 && s[best] >= 2 * s[expected] ? best : null;
}

/** A raw message key, an unfilled ICU argument or a leaked JS value. */
export function placeholderIn(text: string): string | null {
  const m = text.match(/\{[a-zA-Z]+\}|\b(?:seo|marketing|guides|common|help|social|showcase|mediaKit)\.[a-z][A-Za-z]*\.[a-z][\w.]*|\bundefined\b|\[object Object\]|\bNaN\b/);
  return m ? m[0] : null;
}
