/**
 * The text for a voice error at the UI boundary. The room and the voice
 * store hold a `VoiceErrorCode` (`src/utils/voice/errors.ts`); a value
 * that is not a code is shown as it is.
 */
import type { Translate } from '@/i18n/keys';
import { VoiceError, isVoiceErrorCode, type VoiceErrorCode } from '@/utils/voice/errors';

export function voiceErrorText(t: Translate, value: string | null): string | null {
  if (!value) return null;
  return isVoiceErrorCode(value) ? t(`voice.error.${value}`) : value;
}

/** The text for a thrown error: a `VoiceError`'s code, otherwise `fallback`. */
export function voiceErrorMessage(t: Translate, err: unknown, fallback: VoiceErrorCode): string {
  return t(`voice.error.${err instanceof VoiceError ? err.code : fallback}`);
}
