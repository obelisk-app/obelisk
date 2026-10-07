/**
 * The bridge: facade. Values the code in
 * `services/nostr-bridge/facade/page-hub.ts` reads, kept here so every reader
 * imports the one copy.
 */

/**
 * Handshake ceiling for the hub's sockets. Keep enough headroom for an Android
 * PWA waking its radio and opening a WebSocket through Cloudflare; 3 s caused
 * healthy relays to be torn down and recreated in a reconnect loop after resume.
 */
export const CONNECT_HANDSHAKE_TIMEOUT_MS = 10_000;
