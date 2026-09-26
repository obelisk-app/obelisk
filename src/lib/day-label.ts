/**
 * "Today", "Yesterday", or a date — the label above a run of messages.
 *
 * Mobile has had day separators in DM threads for a while; the desktop panel
 * rendered every message in one unbroken column, so a conversation you'd had
 * over three weeks looked like a single sitting and there was no way to tell
 * where you'd left off without reading timestamps bubble by bubble.
 *
 * Extracted so both shells produce the *same* strings. The wording here is
 * exactly what `PhoneShell` already shipped, so adopting it changes nothing
 * on mobile.
 */

import { formatDate, formatTime } from '@/lib/format';
import type { Locale } from '@/i18n';

type Translate = (key: string) => string;

/** Calendar-day key — two timestamps share a divider when these match. */
export function dayKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toDateString();
}

export function dayLabel(unixSeconds: number, t: Translate, locale: Locale): string {
  const date = new Date(unixSeconds * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    // `{time}` because today's divider doubles as "when this run started" —
    // the only day where that's more useful than the date.
    return t('time.today').replace('{time}', formatTime(locale, date));
  }
  if (date.toDateString() === yesterday.toDateString()) return t('time.yesterday');
  return formatDate(locale, date, { month: 'short', day: 'numeric' });
}
