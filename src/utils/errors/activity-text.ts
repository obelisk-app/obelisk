/**
 * What the activity indicators (`ActivityIndicator`, `MobileSigningIndicator`)
 * print for one activity-log entry.
 *
 * The bridge pushes entries whose `label` is an `ActivityCode` and whose
 * `description` is an `EventKindLabel` (`./codes.ts`); `detail` is data
 * while the entry runs (a relay host or URL) and, once it fails, an error
 * code or the relay's own words. An entry from anywhere else, with English
 * in those fields, is printed as it is.
 */
import type { ActivityEntry } from '@/services/feedback/activity-log';
import type { Translate } from '@/i18n/keys';
import { errorCodeOf, isActivityCode, isEventKindLabel } from './codes';

/** The headline: the entry's code read for its status, `{target}` being its detail. */
export function activityTitle(t: Translate, entry: ActivityEntry): string {
  if (!isActivityCode(entry.label)) return entry.label;
  return t(`errors.activity.${entry.label}.${entry.status}`, { target: entry.detail ?? '' });
}

/**
 * The event kind by name (`Send message`), or null when the entry has none.
 * The kind number is protocol jargon, so it is never shown here; the relay
 * debug panel keeps it.
 */
export function activityKind(t: Translate, entry: ActivityEntry): string | null {
  if (entry.description === undefined) return null;
  return isEventKindLabel(entry.description) ? t(`errors.kinds.${entry.description}`) : entry.description;
}

/**
 * The second line: why it failed when the failure has a code, else the
 * event kind, else the detail as it is (a relay URL, a signer's message).
 */
export function activityDetail(t: Translate, entry: ActivityEntry): string | undefined {
  const code = entry.status === 'error' ? errorCodeOf(entry.detail) : null;
  if (code) return t(`errors.codes.${code}`);
  return activityKind(t, entry) ?? entry.detail;
}
