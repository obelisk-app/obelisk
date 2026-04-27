// server/state.ts
// In-memory state shared across socket handlers. Lifted out of server.ts so
// handler modules can read/write the same Maps via ServerContext.

export interface ServerState {
  /** pubkey → socketIds. Drives presence, fan-out, multi-tab read sync. */
  pubkeySockets: Map<string, Set<string>>;
  /** socketId → channelId. Tracks which voice channel each socket is in. */
  voiceSockets: Map<string, string>;
  /** socketId → pubkey. Used for voice signaling target resolution. */
  voiceSocketPubkey: Map<string, string>;
  /** channelId → pubkeys currently sharing camera. Per-channel cap. */
  cameraSharers: Map<string, Set<string>>;
  /** channelId → pubkeys currently sharing screen. Per-channel cap. */
  screenSharers: Map<string, Set<string>>;
}

export function createServerState(): ServerState {
  return {
    pubkeySockets: new Map(),
    voiceSockets: new Map(),
    voiceSocketPubkey: new Map(),
    cameraSharers: new Map(),
    screenSharers: new Map(),
  };
}
