import { type JsGroup } from '@/services/nostr-bridge';
import { formatTime } from '@/utils/format/format';
import type { Locale } from '@/i18n';

/**
 * The two halves of a channel header, kept apart.
 *
 * This used to be one string, `"<category>/<channel>"`, rendered into a
 * single nowrap line capped at `max-width: 65vw`. With a back button and
 * three icon buttons beside it the category ate the width budget and the
 * ellipsis fell on the channel name, so the header truncated exactly the
 * part you needed to read.
 *
 * The category goes on the existing `.chat-breadcrumb` line above instead,
 * where clipping it costs nothing.
 */
export function channelHeaderLabel(
  group: { name?: string | null } | null,
  parentGroup: { name?: string | null; id: string } | null,
  groupId: string,
): { category: string | null; channel: string } {
  return {
    category: parentGroup ? (parentGroup.name ?? parentGroup.id.slice(0, 8)) : null,
    channel: group?.name ?? groupId.slice(0, 8),
  };
}

export function timeOfDay(ts: number, locale: Locale): string {
  return formatTime(locale, new Date(ts * 1000), {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/**
 * User-facing names for each channel kind.
 *
 * The kind ids are wire values (`["t","forum"]` and friends) and never
 * change; this is the only place that decides what a human sees. Without it
 * the picker derived its label from the id itself, so it printed "Forum".
 */
export const CHANNEL_KIND_LABEL: Record<JsGroup['kind'], string> = {
  text: 'Text',
  voice: 'Voice',
  'voice-sfu': 'Voice (SFU)',
  forum: 'Publications',
};
