/**
 * The checks several forms repeat, as pure functions over typed text. A form
 * spec's `ready` and `validate` (`FormSpec`, `src/constants/common/form.ts`)
 * are built from these, so "blank", "a relay address" and "a member's key"
 * mean the same thing in every form.
 */
import { parsePubkeyInput } from '@/utils/identity/parse-pubkey';
import { normalizeRelayInput } from '@/utils/relay-url/relay-url-input';

/** Something other than spaces was typed. */
export function filled(value: string): boolean {
  return value.trim().length > 0;
}

/** Every listed text field is filled. */
export function allFilled(...values: ReadonlyArray<string>): boolean {
  return values.every(filled);
}

/** A typed relay address that `normalizeRelayInput` can make a `ws(s)://` URL of. */
export function isRelayAddress(value: string): boolean {
  return normalizeRelayInput(value) !== null;
}

/** Why a typed member key is not one, or the key as lowercase hex. */
export type MemberKey = { ok: true; hex: string } | { ok: false; problem: 'notNpub' | 'notKey' };

/**
 * A key typed to add a member: an `npub1...` that decodes, or 64 hex
 * characters (either case: the relay compares bytes, so it comes back
 * lowercase). A broken `npub` and anything else are told apart, because the
 * form says which it was.
 */
export function parseMemberKey(value: string): MemberKey {
  const trimmed = value.trim();
  if (trimmed.startsWith('npub1')) {
    const hex = parsePubkeyInput(trimmed);
    return hex ? { ok: true, hex } : { ok: false, problem: 'notNpub' };
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return { ok: true, hex: trimmed.toLowerCase() };
  return { ok: false, problem: 'notKey' };
}

/** The same values with every text field trimmed: what most forms publish. */
export function trimmedValues<V extends Record<string, unknown>>(values: V): V {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) out[key] = typeof value === 'string' ? value.trim() : value;
  return out as V;
}

/** The same fields holding the same values (`Object.is` per field): a form that adopts these need not re-render. */
export function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}
