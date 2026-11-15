import type { RelayHub } from '@nostr-wot/relay/hub';
import type { Event as NostrEvent, Filter } from 'nostr-tools';

/** WebSocket-shaped SDK port. All actual sockets remain owned by RelayHub. */
export function concordSocketConstructor(hub: RelayHub, identityId: string) {
  return class HubSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readonly extensions = '';
    readonly protocol = '';
    readonly bufferedAmount = 0;
    binaryType: BinaryType = 'blob';
    readyState = 0;
    readonly url: string;
    onopen: ((event: Event) => unknown) | null = null;
    onmessage: ((event: MessageEvent) => unknown) | null = null;
    onerror: ((event: Event) => unknown) | null = null;
    onclose: ((event: CloseEvent) => unknown) | null = null;
    private readonly subscriptions = new Map<string, () => void>();

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      void hub.connect(this.url, { identityId }).then(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        const event = new Event('open');
        this.onopen?.(event);
        this.dispatchEvent(event);
      }).catch(() => {
        if (this.readyState !== 0) return;
        const event = new Event('error');
        this.onerror?.(event);
        this.dispatchEvent(event);
        this.close(1011, 'Relay connection failed');
      });
    }

    private receive(frame: unknown[]) {
      if (this.readyState !== 1) return;
      // Real WebSocket replies arrive on a later task. Synchronous delivery loses
      // NEG-ERR/EOSE before the SDK has installed its response observer.
      setTimeout(() => {
        if (this.readyState !== 1) return;
        const event = new MessageEvent('message', { data: JSON.stringify(frame) });
        this.onmessage?.(event);
        this.dispatchEvent(event);
      }, 0);
    }

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (this.readyState !== 1) throw new DOMException('Socket not open', 'InvalidStateError');
      if (typeof data !== 'string') throw new TypeError('Expected Nostr JSON');
      const frame: unknown = JSON.parse(data);
      if (!Array.isArray(frame)) throw new TypeError('Expected Nostr frame');
      const [verb, value, ...rest] = frame;
      if (verb === 'REQ' && typeof value === 'string') {
        this.subscriptions.get(value)?.();
        const subscription = hub.subscribe({
          relays: [this.url], filters: rest as Filter[], identityId, priority: 'active',
          onEvent: event => this.receive(['EVENT', value, event]),
          onEose: () => this.receive(['EOSE', value]),
          onClosed: (_relay, reason) => this.receive(['CLOSED', value, reason]),
        });
        this.subscriptions.set(value, () => subscription.release());
      } else if (verb === 'CLOSE' && typeof value === 'string') {
        this.subscriptions.get(value)?.();
        this.subscriptions.delete(value);
      } else if (verb === 'EVENT') {
        const event = value as NostrEvent;
        void hub.publish({ relays: [this.url], event, identityId, authMode: 'never' }).then(rows => {
          const row = rows[0];
          this.receive(['OK', event.id, row?.status === 'ok', row?.reason ?? row?.status ?? 'unreachable']);
        }).catch(() => this.receive(['OK', event.id, false, 'error: publish failed']));
      } else if (verb === 'NEG-OPEN') {
        this.receive(['NEG-ERR', value, 'unsupported: use paginated REQ']);
      } else if (verb === 'COUNT') {
        this.receive(['CLOSED', value, 'unsupported: COUNT']);
      } else if (verb === 'AUTH') {
        const event = value as NostrEvent;
        this.receive(['OK', event.id, false, 'restricted: Concord transport never authenticates as the account']);
      }
    }

    close(code = 1000, reason = '') {
      if (this.readyState === 3) return;
      this.readyState = 3;
      for (const release of this.subscriptions.values()) release();
      this.subscriptions.clear();
      hub.disconnect(this.url, { identityId });
      setTimeout(() => {
        const event = new CloseEvent('close', { code, reason, wasClean: code === 1000 });
        this.onclose?.(event);
        this.dispatchEvent(event);
      }, 0);
    }
  };
}
