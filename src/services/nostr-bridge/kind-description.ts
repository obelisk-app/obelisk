/** Human label for an event kind, used by the activity log's sign/publish entries. */
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
} from '@/utils/nip-kinds';

export function eventKindDescription(kind: number): string {
  if (kind === KIND_CLIENT_AUTH) return 'NIP-42 relay auth';
  if (kind === KIND_GROUP_CHAT_MESSAGE) return 'Send message';
  if (kind === KIND_ENCRYPTED_DM) return 'Direct message';
  if (kind === KIND_GROUP_METADATA) return 'Group metadata';
  if (kind === KIND_GROUP_ADMINS) return 'Group admins';
  if (kind === KIND_GROUP_MEMBERS) return 'Group members';
  if (kind === KIND_REACTION) return 'Reaction';
  if (kind === KIND_NIP78_APP_DATA) return 'App data';
  if (kind === KIND_RELAY_LIST) return 'Relay list';
  return 'Nostr event';
}
