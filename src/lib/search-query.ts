/**
 * Search query grammar for the message search bar.
 *
 * Lives outside the component so it can be unit-tested, and so the desktop
 * bar and the mobile search screen parse identically.
 *
 * Grammar
 * -------
 *   from:<npub|hex|display name>   → author filter
 *   in:<group id|channel name>     → NIP-29 `#h` filter
 *   mentions:<npub|hex|name>       → `#p` filter
 *   has:link|image|file            → client-side content filter
 *   before:<YYYY-MM-DD>            → `until`
 *   after:<YYYY-MM-DD>             → `since`
 *   "quoted phrase"                → one term, matched literally
 *   anything else                  → free-text terms, ANDed together
 *
 * Why terms are a list rather than one string
 * -------------------------------------------
 * NIP-50 leaves `search` semantics up to the relay, and the relays Obelisk
 * ships against match the value as a *literal substring of the whole
 * string* — `search:"hola mundo"` returns nothing unless those exact 10
 * characters appear together. Sending a raw multi-word query therefore
 * returns zero results for almost every real search.
 *
 * So we split into terms, send only the most selective single term to the
 * relay as a cheap server-side prefilter (`relaySearchTerm`), and apply the
 * full AND across all terms client-side (`matchesTerms`). Quoted phrases are
 * kept intact — a literal substring match is exactly what the relay is good
 * at.
 */

export type HasFilter = 'link' | 'image' | 'file';

export interface SearchTerm {
  readonly text: string;
  /** Came from "quotes" — matched as one literal substring, never split. */
  readonly phrase: boolean;
}

/** A `from:`/`in:`/`mentions:` token whose value we could not resolve. */
export interface UnresolvedToken {
  readonly key: 'from' | 'in' | 'mentions' | 'before' | 'after' | 'has';
  readonly value: string;
}

export interface ParsedQuery {
  readonly terms: ReadonlyArray<SearchTerm>;
  readonly authors: ReadonlyArray<string>;
  readonly mentions: ReadonlyArray<string>;
  readonly groupIds: ReadonlyArray<string>;
  readonly has: ReadonlyArray<HasFilter>;
  readonly since?: number;
  readonly until?: number;
  readonly unresolved: ReadonlyArray<UnresolvedToken>;
}

export interface ResolveContext {
  /** npub / hex / display name → hex pubkey. Return null when unknown. */
  readonly resolvePubkey?: (value: string) => string | null;
  /** group id / channel name → group id. Return null when unknown. */
  readonly resolveGroup?: (value: string) => string | null;
}

const EMPTY: ParsedQuery = {
  terms: [], authors: [], mentions: [], groupIds: [], has: [], unresolved: [],
};

const TOKEN_RE = /^(from|in|mentions|has|before|after):(.*)$/i;

/**
 * Split on whitespace, but keep "quoted phrases" together. Returns raw
 * chunks; quote characters are stripped and the chunk is flagged.
 */
function chunk(raw: string): Array<{ text: string; quoted: boolean }> {
  const out: Array<{ text: string; quoted: boolean }> = [];
  // Either a "…" run (possibly unterminated at end of input) or a bare run
  // of non-space characters.
  const re = /"([^"]*)"?|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      const text = m[1].trim();
      if (text) out.push({ text, quoted: true });
    } else if (m[2]) {
      out.push({ text: m[2], quoted: false });
    }
  }
  return out;
}

/**
 * `YYYY-MM-DD` → unix seconds at UTC midnight. `null` when unparseable, so
 * the caller can report the token instead of silently ignoring it.
 */
export function parseDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  // Rejects 2026-02-31 and friends, which Date.UTC would happily roll over.
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(ms / 1000);
}

export function parseSearchQuery(raw: string, ctx: ResolveContext = {}): ParsedQuery {
  const chunks = chunk(raw);
  if (chunks.length === 0) return EMPTY;

  const terms: SearchTerm[] = [];
  const authors: string[] = [];
  const mentions: string[] = [];
  const groupIds: string[] = [];
  const has: HasFilter[] = [];
  const unresolved: UnresolvedToken[] = [];
  let since: number | undefined;
  let until: number | undefined;

  for (const c of chunks) {
    // A quoted chunk is always a phrase, never a filter token — so you can
    // search for the literal text `from:` if you really want to.
    const m = c.quoted ? null : TOKEN_RE.exec(c.text);
    if (!m) {
      terms.push({ text: c.text, phrase: c.quoted });
      continue;
    }
    const key = m[1].toLowerCase() as UnresolvedToken['key'];
    const value = m[2];
    // `from:` with nothing after it is a half-typed token, not an error.
    if (!value) continue;

    if (key === 'from' || key === 'mentions') {
      const hex = ctx.resolvePubkey?.(value) ?? null;
      if (hex) (key === 'from' ? authors : mentions).push(hex);
      else unresolved.push({ key, value });
    } else if (key === 'in') {
      const id = ctx.resolveGroup?.(value) ?? null;
      if (id) groupIds.push(id);
      else unresolved.push({ key, value });
    } else if (key === 'has') {
      const v = value.toLowerCase();
      if (v === 'link' || v === 'image' || v === 'file') has.push(v);
      else unresolved.push({ key, value });
    } else if (key === 'before' || key === 'after') {
      const ts = parseDate(value);
      if (ts === null) unresolved.push({ key, value });
      else if (key === 'before') until = ts;
      else since = ts;
    }
  }

  return { terms, authors, mentions, groupIds, has, since, until, unresolved };
}

/** True when the query asks for nothing at all — no terms, no filters. */
export function isEmptyQuery(q: ParsedQuery): boolean {
  return q.terms.length === 0
    && q.authors.length === 0
    && q.mentions.length === 0
    && q.groupIds.length === 0
    && q.has.length === 0
    && q.since === undefined
    && q.until === undefined;
}

/**
 * The single term to hand the relay as NIP-50 `search`.
 *
 * The longest term is the most selective, and on a substring-matching relay
 * a longer needle is strictly cheaper. Returns undefined when there are no
 * text terms — a pure `from:`/`in:` query needs no `search` field at all.
 */
export function relaySearchTerm(terms: ReadonlyArray<SearchTerm>): string | undefined {
  let best: string | undefined;
  for (const t of terms) {
    if (!t.text) continue;
    if (best === undefined || t.text.length > best.length) best = t.text;
  }
  return best;
}

/** Every term must appear in `content`, case-insensitively. */
export function matchesTerms(content: string, terms: ReadonlyArray<SearchTerm>): boolean {
  if (terms.length === 0) return true;
  const hay = content.toLowerCase();
  for (const t of terms) {
    if (!hay.includes(t.text.toLowerCase())) return false;
  }
  return true;
}

/**
 * Case-insensitive substring match used to resolve `from:`/`in:` values
 * against display names and channel names. Mirrors `searchGroups`.
 */
export function nameMatches(candidate: string | null | undefined, needle: string): boolean {
  if (!candidate) return false;
  return candidate.toLowerCase().includes(needle.toLowerCase());
}
