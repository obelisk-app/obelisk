/**
 * Small builders for the phone-shell tests: a channel and a message with the
 * fields the bridge always fills, so a test only spells out what it is about.
 */
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

export function group(over: Partial<JsGroup> & { id: string }): JsGroup {
  return {
    name: null, about: null, picture: null, banner: null,
    isPublic: true, isHidden: false, isRestricted: false, isOpen: true,
    parent: null, kind: 'text', forumTags: [], topics: [],
    ...over,
  };
}

export function message(over: Partial<JsMessage> & { id: string }): JsMessage {
  return {
    pubkey: 'a'.repeat(64), content: 'hello', createdAt: 1_700_000_000, kind: 9, replyToId: null, mentions: [],
    ...over,
  };
}
