/**
 * The direct WebSocket path to the SFU: open `/rpc`, answer its NIP-42 style
 * challenge with a signed kind 22242, and hand every later message to the
 * RPC. `SfuRpc.start()` tries this first when the SFU advertises a URL and
 * falls back to relays when it fails (unless the SFU refused us outright).
 */
import { bridge, DirectRpcError } from './sfu-rpc-support';
import { AUTH_KIND, DIRECT_CONNECT_TIMEOUT_MS } from '@/constants/voice/sfu-rpc-support';

export interface DirectRpcHooks {
  sfuUrl: string;
  channelId: string;
  clientId: string;
  /** The socket the RPC should send on, or null once it is gone. */
  attach: (socket: WebSocket | null) => void;
  /** Authentication succeeded: requests may now go out over this socket. */
  onAuthenticated: () => void;
  /** A message after authentication: a response or a notification. */
  onInbound: (message: Record<string, unknown>) => void;
  /** The socket closed after authentication; every pending call fails with this. */
  onLost: (error: DirectRpcError) => void;
}

/** Resolves once the SFU accepts our authentication; rejects with a `DirectRpcError`. */
export async function connectDirectRpc(hooks: DirectRpcHooks): Promise<void> {
  const endpoint = new URL('/rpc', hooks.sfuUrl);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  endpoint.searchParams.set('channelId', hooks.channelId);
  const socket = new WebSocket(endpoint);
  hooks.attach(socket);

  await new Promise<void>((resolve, reject) => {
    let authenticated = false;
    let settled = false;
    const fail = (error: DirectRpcError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      hooks.attach(null);
      try { socket.close(); } catch { /* ignore */ }
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new DirectRpcError('SFU WebSocket authentication timed out')),
      DIRECT_CONNECT_TIMEOUT_MS,
    );
    socket.onerror = () => fail(new DirectRpcError('SFU WebSocket unavailable'));
    socket.onclose = (event) => {
      const message = event.reason || `SFU WebSocket closed (${event.code})`;
      const error = new DirectRpcError(
        event.code === 4403 ? `SFU access denied: ${message}` : message,
        event.code,
      );
      if (!authenticated) return fail(error);
      hooks.onLost(error);
    };
    socket.onmessage = (event) => {
      void (async () => {
        if (typeof event.data !== 'string') throw new DirectRpcError('Invalid SFU WebSocket message');
        const message = JSON.parse(event.data) as Record<string, unknown>;
        if (message.type === 'auth') {
          if (
            message.kind !== AUTH_KIND ||
            message.channelId !== hooks.channelId ||
            typeof message.challenge !== 'string' ||
            typeof message.relay !== 'string'
          ) {
            throw new DirectRpcError('Invalid SFU authentication challenge');
          }
          const b = await bridge();
          const event = await b.signEventTemplate({
            kind: AUTH_KIND,
            content: '',
            tags: [
              ['challenge', message.challenge],
              ['e', hooks.channelId],
              ['relay', message.relay],
            ],
          });
          socket.send(JSON.stringify({ type: 'auth', event, clientId: hooks.clientId }));
          return;
        }
        if (message.type === 'auth_ok') {
          authenticated = true;
          settled = true;
          clearTimeout(timer);
          hooks.onAuthenticated();
          resolve();
          return;
        }
        if (!authenticated) throw new DirectRpcError('SFU WebSocket authentication required');
        hooks.onInbound(message);
      })().catch((err) => fail(
        err instanceof DirectRpcError ? err : new DirectRpcError((err as Error).message),
      ));
    };
  });
}
