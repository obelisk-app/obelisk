// Minimal slug helper for share-link URLs.
//
// Server and channel share-links use human-readable slugs instead of opaque
// IDs so pasted URLs are self-explanatory. Channel.name is already constrained
// to `[a-z0-9_-]{2,32}` by the API, so it's used verbatim. Server.name is
// free-form, so it's passed through `slugify` before embedding in the URL.
//
// Resolution is forgiving: the chat page accepts either the slug OR the raw
// cuid in ?s= / ?c=, so old ID-based links keep working.

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'server';
}

// cuid / cuid2 ids are alphanumeric only, 20–32 chars; channel/server names
// may contain hyphens but are short. This heuristic lets the resolver decide
// whether to look up by id or by slug without a DB round-trip for obvious
// cases.
export function looksLikeCuid(value: string): boolean {
  return /^[a-z0-9]{20,32}$/i.test(value) && !value.includes('-');
}
