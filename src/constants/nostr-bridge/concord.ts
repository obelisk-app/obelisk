export const CONCORD_DB = 'obelisk-concord';
export const CONCORD_STORE = 'sealed';
export const CONCORD_VAULT_PREFIX = 'concord-key:';
export const CONCORD_PLANE_EVENT_LIMIT = 100_000;
export const CONCORD_PLANE_BYTE_LIMIT = 32 * 1024 * 1024;
export const CONCORD_ATTACHMENT_BYTE_LIMIT = 25 * 1024 * 1024;
export const CONCORD_DEFAULT_RELAYS = [
  'wss://relay.dreamith.to',
  'wss://relay.ditto.pub',
  'wss://asia.vectorapp.io/nostr',
] as const;
