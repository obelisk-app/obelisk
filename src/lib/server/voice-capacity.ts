// src/lib/server/voice-capacity.ts
// Camera/screen-share capacity gate for voice channels. Capacity is
// per-channel; the same pubkey re-asserting is allowed (idempotent — the
// caller may be reconnecting after a brief network blip).

export interface VoiceLimits {
  maxCameras: number;
  maxScreens: number;
}

function canAdd(
  sharers: Map<string, Set<string>>,
  channelId: string,
  pubkey: string,
  max: number,
): boolean {
  const set = sharers.get(channelId);
  if (!set) return true;
  if (set.has(pubkey)) return true; // already counted
  return set.size < max;
}

export function canAddCamera(
  cameraSharers: Map<string, Set<string>>,
  channelId: string,
  pubkey: string,
  limits: VoiceLimits,
): boolean {
  return canAdd(cameraSharers, channelId, pubkey, limits.maxCameras);
}

export function canAddScreen(
  screenSharers: Map<string, Set<string>>,
  channelId: string,
  pubkey: string,
  limits: VoiceLimits,
): boolean {
  return canAdd(screenSharers, channelId, pubkey, limits.maxScreens);
}
