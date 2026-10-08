/**
 * The two NIP-46 logins (round 4 plan, step 18): a `bunker://` URL, and the
 * NostrConnect QR flow that has the remote signer find us. Both end in the
 * same install sequence as every other login (`LoginModule.finalizeLogin`).
 * Pure move from `client.ts`.
 */
import { CodedError, codeOrMessage, type ActivityCode, type ErrorCode } from '@/utils/errors/codes';
import { getPublicKey } from 'nostr-tools';
import { BunkerSigner, createNostrConnectURI, parseBunkerInput } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools/pure';
import { failActivity, pushActivity, resolveActivity } from '@/services/feedback/activity-log';
import { bytesToHex, hexToBytes } from '../common/hex';
import type { BunkerModule, RemoteSigner } from './bunker';
import type { SessionState } from './state';

const NOSTRCONNECT_RELAYS = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'];

export class BunkerLogin {
  constructor(
    private readonly state: Pick<SessionState, 'session' | 'currentRelayUrl' | 'sessionGeneration' | 'beginSessionOperation' | 'assertSessionOperation'>,
    private readonly bunker: Pick<BunkerModule, 'signer' | 'onAuth' | 'openAuthUrl' | 'ready'>,
    private readonly finalizeLogin: () => Promise<void>,
    private readonly cancelInstalledLogin: () => Promise<void>,
  ) {}

  /**
   * NIP-46 login from a `bunker://` URL.
   * The local client secret is generated fresh per login and persisted in
   * localStorage so the signer can be rehydrated on page reload.
   */
  async loginWithBunker(
    bunkerUrl: string,
    options?: { onAuthUrl?: (url: string) => void; clientSecretHex?: string; signer?: RemoteSigner },
  ): Promise<string> {
    const generation = this.state.beginSessionOperation();
    const bp = await parseBunkerInput(bunkerUrl);
    this.state.assertSessionOperation(generation);
    if (!bp) throw new CodedError('invalid-bunker-url', 'Invalid bunker URL');
    if (options?.signer && !options.clientSecretHex) throw new CodedError('bunker-missing-secret', 'Paired remote signer is missing its client secret');
    // When a host pre-paired the remote signer (e.g. the @nostr-wot/ui
    // QR / paste flow), it must hand us the SAME client secret it paired
    // with, otherwise the bunker rejects our connect request because
    // this client pubkey was never authorized. Falling back to a fresh
    // key is correct when we *are* the pairing party.
    const pairedByHost = Boolean(options?.signer || options?.clientSecretHex);
    const localSecret = options?.clientSecretHex
      ? hexToBytes(options.clientSecretHex)
      : generateSecretKey();
    this.bunker.onAuth = options?.onAuthUrl ?? null;
    const signerOptions = { onauth: (url: string) => {
      if (generation === this.state.sessionGeneration) this.bunker.openAuthUrl(url);
    } };
    const pairedSigner = options?.signer;
    const signer = pairedSigner ?? BunkerSigner.fromBunker(localSecret, bp, signerOptions);
    const connectId = pushActivity('bunkerConnect' satisfies ActivityCode);
    let pubKeyHex: string;
    try {
      // If the SDK hands us a client secret, it already completed the
      // NostrConnect/bunker pairing with that client identity. Re-running
      // `connect()` here can send an empty/mismatched secret for QR-created
      // bunker URLs and make remote signers reject with "no secret".
      if (!pairedByHost) await (signer as BunkerSigner).connect();
      this.state.assertSessionOperation(generation);
      pubKeyHex = await signer.getPublicKey();
      this.state.assertSessionOperation(generation);
    } catch (e) {
      if (!pairedSigner) signer.close();
      failActivity(connectId, codeOrMessage(e));
      throw e;
    }
    resolveActivity(connectId);
    // The SDK owns `pairedSigner` and closes it when its login modal unmounts.
    // Keep a bridge-owned instance on the same authorized client key instead.
    this.bunker.signer = pairedSigner
      ? BunkerSigner.fromBunker(localSecret, bp, signerOptions)
      : signer;
    this.state.session = {
      pubKeyHex,
      loginMethod: 'bunker',
      relayUrl: this.state.currentRelayUrl.get(),
      bunkerUrl,
      bunkerLocalSecretHex: bytesToHex(localSecret),
    };
    this.bunker.ready.set(true);
    await this.finalizeLogin();
    this.state.assertSessionOperation(generation);
    return pubKeyHex;
  }

  /**
   * NIP-46 NostrConnect (QR) flow, generates a `nostrconnect://` URI for the
   * remote signer to scan. Caller is expected to render the URI as a QR code
   * and `await waitForConnection()` to resolve once the signer connects.
   */
  createNostrConnectSession(options?: { relay?: string; onAuthUrl?: (url: string) => void }): {
    uri: string;
    waitForConnection: () => Promise<string>;
    cancel: () => void;
  } {
    const generation = this.state.beginSessionOperation();
    const localSecret = generateSecretKey();
    const localPubkey = getPublicKey(localSecret);
    const connectRelay = options?.relay || NOSTRCONNECT_RELAYS[0];
    const uri = createNostrConnectURI({
      clientPubkey: localPubkey,
      relays: [connectRelay, ...NOSTRCONNECT_RELAYS],
      secret: Math.random().toString(36).substring(2, 15),
      name: 'Obelisk',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar',
    });

    let cancelled = false;
    let installed = false;
    let completed = false;
    const scanId = pushActivity('bunkerScan' satisfies ActivityCode);
    const waitForConnection = async (): Promise<string> => {
      this.state.assertSessionOperation(generation);
      this.bunker.onAuth = options?.onAuthUrl ?? null;
      let signer;
      try {
        signer = await BunkerSigner.fromURI(localSecret, uri, {
          onauth: (url) => {
            if (!cancelled && generation === this.state.sessionGeneration && this.bunker.onAuth) this.bunker.onAuth(url);
          },
        }, 60000);
      } catch (e) {
        failActivity(scanId, codeOrMessage(e));
        throw e;
      }
      resolveActivity(scanId);
      let pubKeyHex: string;
      try {
        this.state.assertSessionOperation(generation);
        pubKeyHex = await signer.getPublicKey();
        this.state.assertSessionOperation(generation);
      } catch (error) {
        signer.close();
        throw error;
      }
      // Reconstruct a bunker:// URL from the signer's resolved BunkerPointer
      // so we can persist + rehydrate later.
      const bp = (signer as unknown as { bp: { pubkey: string; relays: string[]; secret?: string } }).bp;
      const params = new URLSearchParams();
      bp.relays.forEach((r) => params.append('relay', r));
      if (bp.secret) params.set('secret', bp.secret);
      const bunkerUrl = `bunker://${bp.pubkey}?${params.toString()}`;
      installed = true;
      this.bunker.signer = signer;
      this.state.session = {
        pubKeyHex,
        loginMethod: 'bunker',
        relayUrl: this.state.currentRelayUrl.get(),
        bunkerUrl,
        bunkerLocalSecretHex: bytesToHex(localSecret),
      };
      this.bunker.ready.set(true);
      await this.finalizeLogin();
      this.state.assertSessionOperation(generation);
      completed = true;
      return pubKeyHex;
    };

    return {
      uri,
      waitForConnection,
      cancel: () => {
        if (completed || cancelled) return;
        cancelled = true;
        if (generation === this.state.sessionGeneration) {
          if (installed) void this.cancelInstalledLogin();
          else this.state.beginSessionOperation();
        }
        failActivity(scanId, 'nostrconnect-cancelled' satisfies ErrorCode);
      },
    };
  }
}
