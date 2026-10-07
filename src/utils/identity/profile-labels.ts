import { formatPubkey } from '@nostr-wot/data';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/** Drop null/empty fields so a sparse relay copy can't erase a fuller one. */
export function stripEmpty<T extends object | null | undefined>(value: T): Partial<NonNullable<T>> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ''),
  ) as Partial<NonNullable<T>>;
}

/**
 * The profile page's npub label: `shortNpubLabel` (`npub1abcd…wxyz`, the one
 * format every other key label uses), falling back to trimmed text when the
 * key does not encode. This used to be a private 12…6 copy.
 */
export function profileShortNpub(pubkey: string): string {
  return shortNpubLabel(pubkey) || `${pubkey.slice(0, 10)}…${pubkey.slice(-6)}`;
}

/** The popover's label: the same `shortNpubLabel`, falling back to `formatPubkey`. */
export function popoverShortNpub(pubkey: string): string {
  return shortNpubLabel(pubkey) || formatPubkey(pubkey);
}

/** A person's chosen name from their profile, else `fallback` (a short npub, a trimmed key). */
export function profileNameOr(meta: { displayName?: string | null; name?: string | null } | null | undefined, fallback: string): string {
  return meta?.displayName || meta?.name || fallback;
}
