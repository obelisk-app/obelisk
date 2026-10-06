/**
 * The one resolver: any thrown value to a sentence in the reader's language.
 *
 *   catch (e) { setError(errorText(t, e, 'chat.composer.sendFailed')); }
 *
 * - An error carrying a known code (`CodedError` from the bridge or the DM
 *   call layer, or a bare code string) reads `errors.codes.<code>`.
 * - Anything else reads the `fallback` key when one is given, so the screen
 *   stays in one language.
 * - With no fallback, the error's own message is shown as it came (a
 *   relay's or an extension's words, which we cannot translate), and
 *   `errors.generic` when there is none.
 *
 * Needs the `errors` module in the route's scope (`src/i18n/modules.ts`);
 * `/app` ships it.
 */
import type { MessageKey, Translate } from '@/i18n/keys';
import { errorCodeOf } from './codes';

export function errorText(t: Translate, err: unknown, fallback?: MessageKey): string {
  const code = errorCodeOf(err);
  if (code) return t(`errors.codes.${code}`);
  if (fallback) return t(fallback);
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return raw.trim() || t('errors.generic');
}

/**
 * The reason line under a title that already says what failed (a toast):
 * the code's sentence, or nothing for an error without a code, so a relay's
 * English never sits under a translated title.
 */
export function errorReason(t: Translate, err: unknown): string {
  const code = errorCodeOf(err);
  return code ? t(`errors.codes.${code}`) : '';
}
