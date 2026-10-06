import { nip19 } from 'nostr-tools';

/**
 * A pubkey someone typed or pasted (64 hex characters, an `npub` or an
 * `nprofile`, surrounding spaces ignored) as lowercase hex, or `null` when it
 * is none of those (a name, a broken bech32 string, an `nsec`).
 *
 * The relay roles editor (`parsePubkeyInput`) and the relay search
 * (`decodeNpub`) each had a copy; this is the one both use.
 */
export function parsePubkeyInput(value: string): string | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // Not a bech32 entity: fall through.
  }
  return null;
}
