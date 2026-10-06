/**
 * The DM transport signer (round 4 plan, step 18): the `NostrSigner` shape
 * `@nostr-wot/dm` expects, backed by the session's login method, with the
 * post-quantum NIP-44 path and the pq-envelope tracker the gift-wrap ingest
 * reads back. Pure move from `client.ts` (`getDmSigner`).
 */
import { CodedError } from '@/utils/errors/codes';
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { isPqEnvelope } from '@nostr-wot/pq';
import type { NostrSigner as DmNostrSigner } from '@nostr-wot/signers';
import { memoizeDecrypt } from '../decrypt-cache';
import { hexToBytes } from '../hex';
import type { PersistedSession } from '../session-storage';
import { enqueueSignerOp, type SignerLane } from '../signer-queue';
import type { BunkerModule } from './bunker';

export interface DmSignerDeps {
  bunker: Pick<BunkerModule, 'run'>;
  /** The session's NIP-04 crypto (`dm/nip04.ts`; decrypt through the facade's seam). */
  encryptNip04(recipientPubkey: string, plaintext: string, lane: SignerLane): Promise<string>;
  decryptNip04(senderPubkey: string, ciphertext: string, lane: SignerLane): Promise<string>;
}

/**
 * Build the `NostrSigner` shape `@nostr-wot/dm` (and `@nostr-wot/signers`)
 * expect, backed by the active session, the DM-transport counterpart of
 * `buildNipSigner` (`./nip-signer.ts`). Dispatches by `loginMethod` exactly like
 * the NIP-04 crypto (`dm/nip04.ts`) and `buildNipSigner` do, so all three login
 * methods (nsec, NIP-07, bunker) keep working. Internal only: nothing
 * outside this file's DM send/receive paths should ever see this type,
 * that boundary is what keeps a bad SDK integration scoped to the
 * bridge's DM methods instead of the whole app.
 *
 * `pqTrack`, if given, is written on every `nip44Decrypt` call with
 * whether that call's ciphertext was a post-quantum envelope
 * (`@nostr-wot/pq`'s `isPqEnvelope`). It exists solely so
 * the gift-wrap ingest (`dm/inbox.ts`) can recover `unwrapGiftWrap`'s internal
 * pq-vs-classic routing decision, which its return value doesn't expose.
 *
 * `lane` picks the signer-queue priority, defaulting to `'interactive'`
 * for the same reason `buildNipSigner` (`./nip-signer.ts`) does, the send paths are what
 * a user is waiting on. Only the gift-wrap ingest (`dm/inbox.ts`), which opens
 * inbound wraps nobody is watching a spinner for, passes `'background'`.
 */
export function buildDmSigner(
  session: PersistedSession | null,
  deps: DmSignerDeps,
  pqTrack?: { current: boolean },
  lane: SignerLane = 'interactive',
): DmNostrSigner | null {
  if (!session) return null;
  return {
    getPublicKey: async () => session.pubKeyHex,
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
        return deps.bunker.run(
          (b) => b.signEvent(template) as Promise<NostrEvent>,
          { lane, label: `signEvent:${template.kind}` },
        );
      }
      throw new CodedError('signer-unsupported', `Cannot sign with login method ${session.loginMethod}`); // i18n-exempt: developer message; readers get the code
    },
    nip04Encrypt: (recipientPubkey, plaintext) => deps.encryptNip04(recipientPubkey, plaintext, lane),
    nip04Decrypt: (senderPubkey, ciphertext) => deps.decryptNip04(senderPubkey, ciphertext, lane),
    nip44Encrypt: async (recipientPubkey, plaintext, opts) => {
      if (opts?.scheme === 'pq') {
        // Only the extension path can carry the third argument today:
        // `window.nostr.nip44.encrypt` has a channel for it.  nsec has no
        // ML-KEM key material in this build (that's `src/services/pq/`'s job,
        // out of scope here), and bunker's NIP-46 `nip44_encrypt` request
        // has no field for `recipientKemKey` (see
        // `@nostr-wot/signers`' `Nip46Signer.nip44Encrypt` doc). Both
        // throw rather than silently downgrading a message the caller
        // explicitly asked to protect post-quantum.
        if (session.loginMethod === 'nip07') {
          const w = (window as unknown as {
            nostr?: {
              nip44?: {
                encrypt: (p: string, t: string, o?: { scheme: 'pq'; recipientKemKey: string }) => Promise<string>;
              };
            };
          }).nostr;
          if (!w?.nip44?.encrypt) throw new CodedError('extension-no-nip44', 'Extension does not support NIP-44 encryption');
          return enqueueSignerOp(lane, 'nip44Encrypt:pq', () => w.nip44!.encrypt(recipientPubkey, plaintext, opts));
        }
        throw new CodedError('pq-unavailable', `Post-quantum NIP-44 encryption is not available for login method ${session.loginMethod}`);
      }
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
        return deps.bunker.run(
          (b) => b.nip44Encrypt(recipientPubkey, plaintext),
          { lane, label: 'nip44Encrypt' },
        );
      }
      throw new CodedError('signer-unsupported', `Cannot NIP-44 encrypt with login method ${session.loginMethod}`); // i18n-exempt: developer message; readers get the code
    },
    nip44Decrypt: async (senderPubkey, ciphertext) => {
      // Deliberately OUTSIDE the memo below: the gift-wrap ingest reads
      // this back to recover `unwrapGiftWrap`'s pq-vs-classic routing
      // decision, so it has to be written on a cache hit too, the
      // ciphertext is what determines it, and the ciphertext is the same.
      if (pqTrack) pqTrack.current = isPqEnvelope(ciphertext);
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        const sk = hexToBytes(session.privKeyHex);
        const key = nip44.utils.getConversationKey(sk, senderPubkey);
        return nip44.decrypt(ciphertext, key);
      }
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
          deps.bunker.run(
            (b) => b.nip44Decrypt(senderPubkey, ciphertext),
            { lane, label: 'nip44Decrypt' },
          ),
        );
      }
      throw new CodedError('signer-unsupported', `Cannot NIP-44 decrypt with login method ${session.loginMethod}`); // i18n-exempt: developer message; readers get the code
    },
  };
}
