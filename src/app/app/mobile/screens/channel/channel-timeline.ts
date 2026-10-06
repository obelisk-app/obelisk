import { dayKey, dayLabel } from '@/utils/format/day-label';
import type { JsMessage } from '@/services/nostr-bridge';

export type TimelineItem =
  | { type: 'divider'; key: string; label: string }
  | { type: 'msg'; key: string; msg: JsMessage };

/** Messages in order with a day divider before the first message of each day. */
export function buildTimeline(
  messages: ReadonlyArray<JsMessage>,
  t: Parameters<typeof dayLabel>[1],
  locale: Parameters<typeof dayLabel>[2],
): TimelineItem[] {
  const out: TimelineItem[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const k = dayKey(m.createdAt);
    if (k !== lastDay) {
      out.push({ type: 'divider', key: `d-${k}`, label: dayLabel(m.createdAt, t, locale) });
      lastDay = k;
    }
    out.push({ type: 'msg', key: m.id, msg: m });
  }
  return out;
}
