import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

/**
 * Pure pieces of the desktop channel pane (`ChatPanel.tsx`).
 */

/** What the pane's body is: a publication's threads, a voice room with its docked chat, or the message list. */
export type ChannelPaneBody = 'forum' | 'voice' | 'text';

export function channelPaneBody(group: Pick<JsGroup, 'kind'> | null | undefined): ChannelPaneBody {
  if (group?.kind === 'forum') return 'forum';
  if (group?.kind === 'voice' || group?.kind === 'voice-sfu') return 'voice';
  return 'text';
}

/** Messages by id, so a row's reply parent is looked up once per batch and stays the same object. */
export function indexMessagesById(messages: ReadonlyArray<JsMessage>): ReadonlyMap<string, JsMessage> {
  return new Map(messages.map((m) => [m.id, m] as const));
}
