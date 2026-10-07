/**
 * Voice: errors. Values the code in `utils/voice/errors.ts` reads, kept here
 * so every reader imports the one copy.
 */

export const VOICE_ERROR_CODES = [
  'notLoggedIn', 'membership', 'notMember',
  'cameraLimit', 'cameraEvicted', 'screenTaken', 'screenEvicted', 'roomFull',
  'sfuConnect', 'sfuUnreachable', 'sfuSwitched', 'sfuClosed',
  'permission', 'noDevice', 'deviceBusy',
  'mic', 'camera', 'switchCamera', 'screen', 'quality', 'join', 'relayRefused',
  'sfuUrlInvalid', 'sfuInfoHttp', 'sfuNotObelisk', 'sfuInfoInvalid', 'sfuOriginMismatch',
] as const;
