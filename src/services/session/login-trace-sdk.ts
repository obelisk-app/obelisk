import { Nip46Signer, type NostrConnectOptions } from '@nostr-wot/signers';
import { AbstractSimplePool } from 'nostr-tools/pool';
import { verifyEvent } from 'nostr-tools/pure';
import { KIND_NOSTR_CONNECT } from '@/constants/nostr/nip-kinds';
import { traceLogin, traceLoginFailure, traceRelayHost } from './login-trace';

let users = 0;
let restore: (() => void) | undefined;
let attempt = 0;

/** Select metadata explicitly: no full frames, identifiers, tags, content, URLs or secrets. */
export function traceSignerFrame(data: unknown, direction: 'send' | 'receive', context: { attempt: number; relay: string }): void {
  if (typeof data !== 'string') return;
  try {
    const frame: unknown = JSON.parse(data);
    if (!Array.isArray(frame)) return;
    const type = frame[0];
    if (!['REQ', 'CLOSE', 'EVENT', 'EOSE', 'CLOSED', 'NOTICE', 'OK', 'AUTH'].includes(type)) return;
    const detail: Record<string, string | number | boolean> = { ...context, direction, type };
    if (type === 'EVENT') {
      const event = frame[direction === 'send' ? 1 : 2];
      if (!event || typeof event !== 'object' || event.kind !== KIND_NOSTR_CONNECT) return;
      detail.signatureValid = verifyEvent(event);
      if (typeof event.created_at === 'number') detail.ageSeconds = Math.floor(Date.now() / 1000) - event.created_at;
      detail.contentBytes = typeof event.content === 'string' ? event.content.length : 0;
      detail.encryption = typeof event.content === 'string' && event.content.includes('?iv=') ? 'nip04' : 'nip44-or-unknown';
    }
    if (type === 'OK') detail.accepted = frame[2] === true;
    if (type === 'CLOSED' || type === 'NOTICE' || (type === 'OK' && frame[2] !== true)) {
      detail.reason = traceLoginFailure(frame[type === 'NOTICE' ? 1 : type === 'OK' ? 3 : 2]);
    }
    traceLogin('relay.frame', detail);
  } catch { traceLogin('relay.unparseable-frame', context); }
}

function tracedPool(id: number): AbstractSimplePool {
  class TracedSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      const context = { attempt: id, relay: traceRelayHost(String(url)) };
      traceLogin('relay.connecting', context);
      this.addEventListener('open', () => traceLogin('relay.open', context));
      this.addEventListener('error', () => traceLogin('relay.error', context));
      this.addEventListener('close', (event) => traceLogin('relay.closed', { ...context, code: event.code, clean: event.wasClean }));
      this.addEventListener('message', (event) => traceSignerFrame(event.data, 'receive', context));
    }
    override send(data: Parameters<WebSocket['send']>[0]): void {
      traceSignerFrame(data, 'send', { attempt: id, relay: traceRelayHost(this.url) });
      super.send(data);
    }
  }
  // Same defaults as SimplePool; the socket subclass only observes traffic.
  return new AbstractSimplePool({ verifyEvent, websocketImplementation: TracedSocket, maxWaitForConnection: 3000 });
}

function observeSigner(signer: Nip46Signer, id: number): Nip46Signer {
  const getPublicKey = signer.getPublicKey.bind(signer);
  signer.getPublicKey = async () => {
    traceLogin('sdk.get-public-key.start', { attempt: id });
    try {
      const pubkey = await getPublicKey();
      traceLogin('sdk.get-public-key.success', { attempt: id });
      return pubkey;
    } catch (error) {
      traceLogin('sdk.get-public-key.failure', { attempt: id, reason: traceLoginFailure(error) });
      throw error;
    }
  };
  return signer;
}

function optionsForTrace<T extends Partial<NostrConnectOptions>>(options: T, id: number): T & { pool: AbstractSimplePool } {
  return {
    ...options,
    pool: options.pool ?? tracedPool(id),
    onAuthChallenge: (url: string) => {
      traceLogin('sdk.auth-challenge', { attempt: id });
      options.onAuthChallenge?.(url);
    },
  };
}

/** Observe the published SDK during local diagnosis; no global WebSocket replacement. */
export function installLoginTrace(): () => void {
  if (process.env.NODE_ENV !== 'development') return () => {};
  if (users++ === 0) {
    const start = Nip46Signer.startNostrConnect;
    const bunker = Nip46Signer.fromBunkerUri;
    Nip46Signer.startNostrConnect = (options) => {
      const id = ++attempt;
      traceLogin('sdk.qr.start', { attempt: id, relayCount: options.relays.length });
      try {
        const handle = start.call(Nip46Signer, optionsForTrace(options, id));
        traceLogin('sdk.qr.created', { attempt: id });
        return {
          ...handle,
          cancel: () => { traceLogin('sdk.qr.cancel', { attempt: id }); handle.cancel(); },
          ready: handle.ready.then((signer) => {
            traceLogin('sdk.pairing.accepted', { attempt: id });
            return observeSigner(signer, id);
          }, (error: unknown) => {
            traceLogin('sdk.pairing.failure', { attempt: id, reason: traceLoginFailure(error) });
            throw error;
          }),
        };
      } catch (error) {
        traceLogin('sdk.qr.failure', { attempt: id, reason: traceLoginFailure(error) });
        throw error;
      }
    };
    Nip46Signer.fromBunkerUri = async (uri, options = {}) => {
      const id = ++attempt;
      traceLogin('sdk.bunker.start', { attempt: id });
      try {
        const signer = await bunker.call(Nip46Signer, uri, optionsForTrace(options, id));
        traceLogin('sdk.bunker.accepted', { attempt: id });
        return observeSigner(signer, id);
      } catch (error) {
        traceLogin('sdk.bunker.failure', { attempt: id, reason: traceLoginFailure(error) });
        throw error;
      }
    };
    restore = () => { Nip46Signer.startNostrConnect = start; Nip46Signer.fromBunkerUri = bunker; };
  }
  traceLogin('modal.trace-attached', { secureContext: window.isSecureContext, protocol: window.location.protocol });
  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    traceLogin('modal.trace-detached');
    if (--users === 0) { restore?.(); restore = undefined; }
  };
}
