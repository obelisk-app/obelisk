/**
 * The activity log's name for an event kind, as a code: the indicators read
 * it as `errors.kinds.<label>` in the reader's language.
 */
import type { EventKindLabel } from '@/utils/errors/codes';
import {
  KIND_CLIENT_AUTH,
  KIND_ENCRYPTED_DM,
  KIND_GROUP_ADMINS,
  KIND_GROUP_CHAT_MESSAGE,
  KIND_GROUP_MEMBERS,
  KIND_GROUP_METADATA,
  KIND_NIP78_APP_DATA,
  KIND_REACTION,
  KIND_RELAY_LIST,
} from '@/utils/nostr/nip-kinds';

export function eventKindDescription(kind: number): EventKindLabel {
  if (kind === KIND_CLIENT_AUTH) return 'relayAuth';
  if (kind === KIND_GROUP_CHAT_MESSAGE) return 'message';
  if (kind === KIND_ENCRYPTED_DM) return 'dm';
  if (kind === KIND_GROUP_METADATA) return 'groupMetadata';
  if (kind === KIND_GROUP_ADMINS) return 'groupAdmins';
  if (kind === KIND_GROUP_MEMBERS) return 'groupMembers';
  if (kind === KIND_REACTION) return 'reaction';
  if (kind === KIND_NIP78_APP_DATA) return 'appData';
  if (kind === KIND_RELAY_LIST) return 'relayList';
  return 'event';
}
