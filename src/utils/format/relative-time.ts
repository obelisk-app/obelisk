import { formatDate } from '@/utils/format/format';
import type { Locale } from '@/i18n';
import type { MessageKey, Translate } from '@/i18n/keys';

/**
 * "just now", `5m`, `3h`, `2d`, then a short date: the compact age shown on
 * DM rows and inbox cards.
 *
 * The locale is a parameter rather than a hook call because this is a
 * module-level helper shared by a dozen screens, and a bare
 * `toLocaleDateString()` follows the operating system, not the app, so
 * every one of these dates would ignore the language the reader picked.
 *
 * `justNowKey` exists because the mobile shell and the social feed grew
 * separate dictionary entries for the same word (`time.justNow` and
 * `social.now`); passing the key keeps either caller's copy intact while
 * the thresholds live in one place.
 */
export function relativeTime(
  unixSeconds: number,
  t: Translate,
  locale: Locale,
  justNowKey: MessageKey = 'common.time.justNow',
): string {
  const date = new Date(unixSeconds * 1000);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t(justNowKey);
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return formatDate(locale, date, { year: 'numeric', month: 'short', day: 'numeric' });
}
