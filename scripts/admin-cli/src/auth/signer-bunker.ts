import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools/pure';
import type { SignedChallengeEvent } from './signer-nsec';

export type BunkerHandle = {
  signer: BunkerSigner;
  userPubkey: string;
  disconnect: () => Promise<void>;
};

export async function connectBunker(bunkerUri: string, timeoutMs = 45_000): Promise<BunkerHandle> {
  const bp = await parseBunkerInput(bunkerUri);
  if (!bp) throw new Error('Could not parse bunker URI (expected bunker://<pubkey>?relay=...&secret=...)');

  const clientSecret = generateSecretKey();
  const signer = BunkerSigner.fromBunker(clientSecret, bp);

  const connectWithTimeout = <T>(p: Promise<T>) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Bunker connect timed out — is your signer (e.g. nsec.app) open?')), timeoutMs)
      ),
    ]);

  await connectWithTimeout(signer.connect());
  const userPubkey = await connectWithTimeout(signer.getPublicKey());

  return {
    signer,
    userPubkey,
    async disconnect() {
      try { await (signer as any).close?.(); } catch { /* ignore */ }
    },
  };
}

export async function signChallengeWithBunker(
  handle: BunkerHandle,
  challenge: string
): Promise<SignedChallengeEvent> {
  const template = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: challenge,
    pubkey: handle.userPubkey,
  };
  const signed = await handle.signer.signEvent(template);
  return {
    pubkey: signed.pubkey,
    content: signed.content,
    kind: signed.kind,
    created_at: signed.created_at,
    sig: signed.sig,
    id: signed.id,
    tags: signed.tags,
  };
}
