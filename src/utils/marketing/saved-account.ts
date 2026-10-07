/**
 * Reading the saved session record and the kind 0 profile cache (the strings
 * the app wrote to storage) into the account the marketing pages show.
 */

export interface SavedAccount {
  pubkey: string;
  /** Display name, then name, from the cached profile; null when none is cached. */
  name: string | null;
  picture: string | null;
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/;

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The saved session's pubkey, or null when no well-formed session is saved. */
export function parseSessionPubkey(raw: string | null): string | null {
  const pubkey = parseObject(raw)?.pubKeyHex;
  return typeof pubkey === 'string' && HEX_PUBKEY.test(pubkey) ? pubkey : null;
}

/** Name and picture of `pubkey` from the profile cache's kind 0 content. */
export function parseCachedProfile(raw: string | null, pubkey: string): Pick<SavedAccount, 'name' | 'picture'> {
  const byPubkey = parseObject(raw)?.byPubkey;
  const event = byPubkey && typeof byPubkey === 'object' ? (byPubkey as Record<string, unknown>)[pubkey] : null;
  const content = event && typeof event === 'object' ? (event as Record<string, unknown>).content : null;
  const meta = parseObject(typeof content === 'string' ? content : null) ?? {};
  return {
    name: text(meta.display_name) ?? text(meta.displayName) ?? text(meta.name),
    picture: text(meta.picture),
  };
}
