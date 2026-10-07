/**
 * Voice failures a person reads, as codes. The voice client, the room hooks
 * and the store carry the code; the component that shows it resolves
 * `voice.error.<code>` (`voiceErrorText` in `src/utils/voice/error-text.ts`).
 * A `VoiceError`'s message stays English and is for logs and tests only.
 */
import { errorCodeOf, type ErrorCode } from '@/utils/errors/codes';
import { VOICE_ERROR_CODES } from '@/constants/voice/errors';

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

const CODES: ReadonlySet<string> = new Set(VOICE_ERROR_CODES);

export function isVoiceErrorCode(value: unknown): value is VoiceErrorCode {
  return typeof value === 'string' && CODES.has(value);
}

/** An error the room shows by `code`; `message` is the English detail for logs. */
export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode, message: string = code) {
    super(message);
    this.name = 'VoiceError';
    this.code = code;
  }
}

/** The problem with a microphone, camera or screen request, by its DOMException name. */
export type MediaDeviceProblem = 'permission' | 'noDevice' | 'deviceBusy';

const DEVICE_PROBLEMS: Readonly<Record<string, MediaDeviceProblem>> = {
  NotAllowedError: 'permission',
  SecurityError: 'permission',
  NotFoundError: 'noDevice',
  OverconstrainedError: 'noDevice',
  NotReadableError: 'deviceBusy',
};

export function mediaDeviceProblem(err: unknown): MediaDeviceProblem | null {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? DEVICE_PROBLEMS[name] ?? null : null;
}

/** NIP-01 machine-readable prefixes a relay puts on a refused event or REQ. */
const RELAY_REFUSAL = /\b(?:restricted|blocked|auth-required):/;

/** Bridge error codes (`src/utils/errors/codes.ts`) that already say what went wrong in a call. */
const FROM_BRIDGE_CODE: Partial<Record<ErrorCode, VoiceErrorCode>> = {
  'not-logged-in': 'notLoggedIn',
  'auth-refused': 'relayRefused',
  'not-whitelisted': 'relayRefused',
};

/**
 * The code to show for `err`: a `VoiceError`'s own code, a media-device
 * problem by name, a bridge error code that has a voice counterpart, a relay
 * refusal by its NIP-01 prefix, otherwise `fallback` (what the user was
 * trying to do).
 */
export function voiceErrorCode(err: unknown, fallback: VoiceErrorCode): VoiceErrorCode {
  if (err instanceof VoiceError) return err.code;
  const device = mediaDeviceProblem(err);
  if (device) return device;
  const bridgeCode = errorCodeOf(err);
  const mapped = bridgeCode ? FROM_BRIDGE_CODE[bridgeCode] : undefined;
  if (mapped) return mapped;
  return err instanceof Error && RELAY_REFUSAL.test(err.message) ? 'relayRefused' : fallback;
}
