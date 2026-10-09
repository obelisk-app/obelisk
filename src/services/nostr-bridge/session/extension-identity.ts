import { CodedError } from '@/utils/errors/codes';
import { enqueueSignerOp } from './signer-queue';

/** Verify the extension itself; account-event payloads are page-controlled. */
export async function readExtensionPubkey(): Promise<string> {
  const extension = typeof window === 'undefined' ? undefined : window.nostr;
  if (!extension) throw new CodedError('extension-missing', 'No NIP-07 browser extension detected');
  const pubkey = await enqueueSignerOp('interactive', 'getPublicKey', () => extension.getPublicKey());
  if (typeof pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error('Extension returned an invalid public key');
  }
  return pubkey.toLowerCase();
}
