/**
 * The NIP-59 signer (round 4 plan, step 18): sign plus NIP-44 routed through
 * the session's login method, for the read-state sync engine and the zap /
 * NWC flow (`useNipSigner`). Pure move from `client.ts` (`getNipSigner`).
 */
import { CodedError } from '@/utils/errors/codes';
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import type { NipSigner } from '@/constants/nostr/nip-signer';
import { memoizeDecrypt } from '../cache/decrypt-cache';
import { hexToBytes } from '../common/hex';
import type { PersistedSession } from './session-storage';
import { enqueueSignerOp, type SignerLane } from './signer-queue';
import type { BunkerModule } from './bunker';

/**
 * Build a {@link NipSigner} backed by the active session, sign + NIP-44
 * encrypt/decrypt routed through whichever login method the user picked.
 * Used by the read-state relay-sync engine to NIP-59 gift-wrap state
 * events. Returns `null` when there is no active session.
 *
 * Bunker NIP-44 round-trips can be slow (the remote signer signs and
 * encrypts on every call); callers should debounce publish bursts.
 *
 * `lane` picks the signer-queue priority for every operation on the
 * returned signer. It defaults to `'interactive'` **on purpose**: this
 * signer backs both the read-state sync engine (genuinely background) and
 * the zap / NWC payment flow via `useNipSigner` (a user is watching a
 * spinner). Inferring the lane from the method name would put payments
 * behind the inbound-decrypt backlog, so the lane is the caller's call and
 * the default is the one that's safe to get wrong.
 */
export function buildNipSigner(
  session: PersistedSession | null,
  bunker: Pick<BunkerModule, 'run'>,
  lane: SignerLane = 'interactive',
): NipSigner | null {
  if (!session) return null;
  const pubkey = session.pubKeyHex;
  return {
    pubkey,
    signEvent: async (template) => {
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        const sk = hexToBytes(session.privKeyHex);
        return finalizeEvent({ ...template }, sk);
      }
      if (session.loginMethod === 'nip07') {
        const w = (window as unknown as { nostr?: { signEvent: (e: unknown) => Promise<NostrEvent> } }).nostr;
        if (!w) throw new CodedError('extension-missing', 'NIP-07 extension unavailable');
        return enqueueSignerOp(lane, `signEvent:${template.kind}`, () => w.signEvent(template));
      }
      if (session.loginMethod === 'bunker') {
        return bunker.run(
          (b) => b.signEvent(template) as Promise<NostrEvent>,
          { lane, label: `signEvent:${template.kind}` },
        );
      }
      throw new CodedError('signer-unsupported', `Cannot sign with login method ${session.loginMethod}`); // i18n-exempt: developer message; readers get the code
    },
    nip44Encrypt: async (recipientPubkey, plaintext) => {
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        const sk = hexToBytes(session.privKeyHex);
        const key = nip44.utils.getConversationKey(sk, recipientPubkey);
        return nip44.encrypt(plaintext, key);
      }
      if (session.loginMethod === 'nip07') {
        const w = (window as unknown as {
          nostr?: { nip44?: { encrypt: (p: string, t: string) => Promise<string> } };
        }).nostr;
        if (!w?.nip44?.encrypt) throw new CodedError('extension-no-nip44', 'Extension does not support NIP-44 encryption');
        return enqueueSignerOp(lane, 'nip44Encrypt', () => w.nip44!.encrypt(recipientPubkey, plaintext));
      }
      if (session.loginMethod === 'bunker') {
        return bunker.run(
          (b) => b.nip44Encrypt(recipientPubkey, plaintext),
          { lane, label: 'nip44Encrypt' },
        );
      }
      throw new CodedError('signer-unsupported', `Cannot NIP-44 encrypt with login method ${session.loginMethod}`); // i18n-exempt: developer message; readers get the code
    },
    nip44Decrypt: async (senderPubkey, ciphertext) => {
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        const sk = hexToBytes(session.privKeyHex);
        const key = nip44.utils.getConversationKey(sk, senderPubkey);
        return nip44.decrypt(ciphertext, key);
      }
      // Remote signers only: the same wrap reaches this method from several
      // subscriptions at once, and each round-trip is the expensive part.
      // See `./decrypt-cache.ts`.
      if (session.loginMethod === 'nip07') {
        const w = (window as unknown as {
          nostr?: { nip44?: { decrypt: (p: string, c: string) => Promise<string> } };
        }).nostr;
        if (!w?.nip44?.decrypt) throw new CodedError('extension-no-nip44', 'Extension does not support NIP-44 decryption');
        return memoizeDecrypt('nip44', senderPubkey, ciphertext, () =>
          enqueueSignerOp(lane, 'nip44Decrypt', () => w.nip44!.decrypt(senderPubkey, ciphertext)),
        );
      }
      if (session.loginMethod === 'bunker') {
        return memoizeDecrypt('nip44', senderPubkey, ciphertext, () =>
          bunker.run(
            (b) => b.nip44Decrypt(senderPubkey, ciphertext),
            { lane, label: 'nip44Decrypt' },
          ),
        );
      }
      throw new CodedError('signer-unsupported', `Cannot NIP-44 decrypt with login method ${session.loginMethod}`); // i18n-exempt: developer message; readers get the code
    },
  };
}
