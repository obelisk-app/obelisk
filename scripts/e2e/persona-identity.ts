import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { FreshIdentity } from './lib';

/** Fresh identities are the default for the dual-protocol suite, never logged. */
export function createTestPersonas(): { owner: FreshIdentity; member: FreshIdentity } {
  const create = (): FreshIdentity => {
    const sk = generateSecretKey();
    const pkHex = getPublicKey(sk);
    return {
      skHex: Buffer.from(sk).toString('hex'), pkHex,
      nsec: nip19.nsecEncode(sk), npub: nip19.npubEncode(pkHex),
    };
  };
  return { owner: create(), member: create() };
}

/** Never pass the environment or decoder errors to a reporter: they may contain secrets. */
export function loadPersonaIdentity(
  persona: 'CAPITAN_MATE' | 'MILO_ALFAJOR',
  env: Readonly<Record<string, string | undefined>> = process.env,
): FreshIdentity {
  const nsec = env[`OBELISK_E2E_${persona}_NSEC`]?.trim();
  const expectedNpub = env[`OBELISK_E2E_${persona}_NPUB`]?.trim();
  if (!nsec || !expectedNpub) throw new Error(`Missing E2E credentials for ${persona}`);
  try {
    const decoded = nip19.decode(nsec);
    const expected = nip19.decode(expectedNpub);
    if (decoded.type !== 'nsec' || expected.type !== 'npub') throw new Error();
    const pkHex = getPublicKey(decoded.data);
    if (pkHex !== expected.data) throw new Error();
    return {
      skHex: Buffer.from(decoded.data).toString('hex'),
      pkHex,
      nsec,
      npub: nip19.npubEncode(pkHex),
    };
  } catch {
    throw new Error(`Invalid or mismatched E2E credentials for ${persona}`);
  }
}
