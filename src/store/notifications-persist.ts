/**
 * Saved-data versioning for the notifications store, kept beside it so the
 * store file stays short.
 *
 * Version history:
 *   0  before versioning. Mention cards written before replies were tracked
 *      have no `reason`; readers had to treat a missing one as `'mention'`.
 *   1  every saved mention card carries a `reason`.
 */
import type { DmNotification, MentionNotification, MentionReason, NotificationsPersisted } from './notifications';
import { arrayOf, asRecord, finiteOrUndefined, isFiniteNumber, oneOf, recordOf, type Upgrade } from './persist-version';

export const NOTIFICATIONS_STORE_VERSION = 1;

const REASONS: readonly MentionReason[] = ['mention', 'reply'];

/** Version 0 -> 1: a card without a `reason` predates reply tracking, so it was a mention. */
const fillMentionReasons: Upgrade = (raw) => ({
  ...raw,
  mentionsByRelay: recordOf(raw.mentionsByRelay, (list) =>
    Array.isArray(list)
      ? list.map((card) => {
          const c = asRecord(card);
          return c.reason === undefined ? { ...c, reason: 'mention' } : card;
        })
      : list,
  ),
});

export const NOTIFICATIONS_UPGRADES: Readonly<Record<number, Upgrade>> = { 0: fillMentionReasons };

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sanitizeMention(value: unknown): MentionNotification | undefined {
  const c = asRecord(value);
  const id = str(c.id);
  const relay = str(c.relay);
  const channelId = str(c.channelId);
  const senderPubkey = str(c.senderPubkey);
  const preview = str(c.preview);
  if (!id || !relay || channelId === undefined || !senderPubkey || preview === undefined) return undefined;
  if (!isFiniteNumber(c.createdAt)) return undefined;
  const reason = oneOf(c.reason, REASONS);
  return {
    id, relay, channelId, senderPubkey, preview, createdAt: c.createdAt,
    ...(reason ? { reason } : {}),
    ...(c.seen === true ? { seen: true } : {}),
  };
}

function sanitizeDmCard(value: unknown): DmNotification | undefined {
  const c = asRecord(value);
  const id = str(c.id);
  const senderPubkey = str(c.senderPubkey);
  const preview = str(c.preview);
  if (!id || !senderPubkey || preview === undefined || !isFiniteNumber(c.createdAt)) return undefined;
  return { id, senderPubkey, preview, createdAt: c.createdAt };
}

/** Cards missing a required field are dropped one by one; the rest of the log survives. */
export function sanitizeNotificationsPersisted(raw: Record<string, unknown>): NotificationsPersisted {
  return {
    mentionsByRelay: recordOf(raw.mentionsByRelay, (list) => {
      const cards = arrayOf(list, sanitizeMention);
      return cards.length > 0 ? cards : undefined;
    }),
    mentionCursorByRelay: recordOf(raw.mentionCursorByRelay, finiteOrUndefined),
    dmNotifications: arrayOf(raw.dmNotifications, sanitizeDmCard),
  };
}
