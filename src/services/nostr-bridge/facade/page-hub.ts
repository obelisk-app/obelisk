/**
 * The page's RelayHub, with the options obelisk gives it, in one place.
 *
 * `getRelayHub` binds its options on the first call only. The bridge and
 * the social SDK pool (`src/services/social/pool.ts`, at import time) both reach
 * the hub through here, so whichever of them loads first creates it the
 * same way. A test that wants its own transport creates the hub before
 * importing either (`relay-hub-bridge.test.ts` does).
 */
import { TextCoercingWebSocket } from '@nostr-wot/data';
import { getRelayHub, type RelayHub } from '@/lib/relay-hub';
import { CONNECT_HANDSHAKE_TIMEOUT_MS } from '@/constants/nostr-bridge/facade';

/**
 * Some relays (or compressing proxies) push EVENT/EOSE frames as binary.
 * nostr-tools' default parser crashes on any non-string payload, silently
 * dropping events; TextCoercingWebSocket UTF-8-decodes binary frames first.
 */
export const PAGE_WEBSOCKET = TextCoercingWebSocket as unknown as typeof WebSocket;

export function pageRelayHub(): RelayHub {
  return getRelayHub({
    connectTimeoutMs: CONNECT_HANDSHAKE_TIMEOUT_MS,
    transport: { websocketImplementation: PAGE_WEBSOCKET, enablePing: true },
  });
}
