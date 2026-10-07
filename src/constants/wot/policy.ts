/**
 * Web of trust: policy. Values the code in `services/wot/policy.ts` reads,
 * kept here so every reader imports the one copy.
 */

import {
  KIND_GROUP_CREATE,
  KIND_GROUP_METADATA,
  KIND_GROUP_ADMINS,
  KIND_GROUP_MEMBERS,
  KIND_VOICE_PRESENCE,
  KIND_VOICE_SIGNAL,
} from '@/constants/nostr/nip-kinds';
import type { WotEngineConfig } from '@/services/wot/policy';

export const DEFAULT_WOT_CONFIG: Readonly<WotEngineConfig> = { enabled: false, maxHops: 2, minPaths: 1 };

/** Group structure and voice signaling: never gated, or the room cannot render or talk. */
export const ALWAYS_ALLOW_KINDS = new Set<number>([
  KIND_GROUP_METADATA,
  KIND_GROUP_ADMINS,
  KIND_GROUP_MEMBERS,
  KIND_GROUP_CREATE,
  // Voice signaling: mesh voice is gated by NIP-29 membership inside the
  // channel; layering WoT on top means a participant whose follow graph is
  // sparse can fail to talk to half the room. The room is small (cap 8),
  // the participants are already vetted by the channel admin's member
  // list, and the events are short-lived ephemeral kinds.
  KIND_VOICE_PRESENCE,
  KIND_VOICE_SIGNAL,
]);
