import type { JsUserMetadata } from '@/services/nostr-bridge';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/**
 * The account pill's two lines. Pure.
 */

/** The person's display name, else their name, else null (the pill says "You"). */
export function profileName(meta: Pick<JsUserMetadata, 'displayName' | 'name'> | null | undefined): string | null {
  return meta?.displayName || meta?.name || null;
}

/** The line under the name: the NIP-05 (without the `_@` of a root identifier), else a short npub, never raw hex. */
export function profileHandle(meta: Pick<JsUserMetadata, 'nip05'> | null | undefined, pubkey: string): string {
  return meta?.nip05 ? meta.nip05.replace(/^_@/, '') : shortNpubLabel(pubkey);
}
