import type { LoginArgs, GeneratedProfileDraft } from '@/types/session/login';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { getPool, nsecToBytes, nsecToHex as sdkNsecToHex } from '@nostr-wot/data';
import { randomProfileName } from '@/utils/identity/display-name';

function nsecToHex(nsec: string): { skHex: string; pkHex: string } {
  const sk = nsecToBytes(nsec);
  if (!sk) throw new Error('Invalid nsec');
  const skHex = sdkNsecToHex(nsec);
  if (!skHex) throw new Error('Invalid nsec');
  const pkHex = getPublicKey(sk);
  return { skHex, pkHex };
}

function nsecToSkHex(nsec: string): string {
  const skHex = sdkNsecToHex(nsec);
  if (!skHex) throw new Error('Invalid nsec');
  return skHex;
}

/**
 * Hand the SDK's login result to the matching bridge entrypoint:
 *   - nip07              → bridge.loginWithNip07(pubkey)
 *   - import / generate  → bridge.loginWithNsec(skHex, pkHex) using args.nsec
 *   - nip46              → bridge.loginWithBunker(args.bunkerUri)
 */
export async function routeToBridge(bridge: Pick<BridgeImpl, 'loginWithNip07' | 'loginWithNsec' | 'loginWithBunker'>, args: LoginArgs): Promise<void> {
  const { method, pubkey, nsec, bunkerUri, clientNsec, signer } = args;
  switch (method) {
    case 'nip07':
      await bridge.loginWithNip07(pubkey);
      return;

    case 'import':
    case 'generate': {
      if (!nsec) throw new Error('SDK did not provide an nsec for the bridge');
      const { skHex, pkHex } = nsecToHex(nsec);
      await bridge.loginWithNsec(skHex, pkHex);
      return;
    }

    case 'nip46': {
      if (!bunkerUri) throw new Error('SDK did not provide a bunker URI');
      if (!signer) throw new Error('SDK did not provide the paired remote signer');
      // The SDK has already paired the remote signer with `clientNsec`.
      // We must reuse that client identity, a fresh key would be
      // rejected by the signer ("no secret") since it never authorized it.
      await bridge.loginWithBunker(bunkerUri, {
        ...(clientNsec ? { clientSecretHex: nsecToSkHex(clientNsec) } : {}),
        signer: signer as NonNullable<Parameters<typeof bridge.loginWithBunker>[1]>['signer'],
      });
      return;
    }
  }
}

const GENERATED_PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es',
];

/** Publish a freshly generated key's kind 0 to a few public relays, so the new person is findable. */
export async function publishGeneratedProfile(nsec: string, profile: GeneratedProfileDraft): Promise<void> {
  const secretKey = nsecToBytes(nsec);
  if (!secretKey) return;
  const name = profile.name?.trim() || randomProfileName();
  const content = {
    name,
    display_name: name,
    ...(profile.about ? { about: profile.about } : {}),
    ...(profile.picture ? { picture: profile.picture } : {}),
    ...(profile.banner ? { banner: profile.banner } : {}),
  };
  const event = finalizeEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(content),
  }, secretKey);
  try { await Promise.allSettled(getPool().publish(GENERATED_PROFILE_RELAYS, event)); } catch { /* non-fatal */ }
}
