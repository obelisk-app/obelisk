import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

/** The forwarded message body: a one-line attribution, then the original quoted line by line. */
export function forwardedContent(
  msg: Pick<JsMessage, 'content'>,
  opts: { authorName: string; fromChannel: string | null; label: string },
): string {
  const where = opts.fromChannel ? ` #${opts.fromChannel}` : '';
  const quoted = msg.content.split('\n').map((line) => `> ${line}`).join('\n');
  return `**${opts.label}**${where} · ${opts.authorName}\n${quoted}`;
}

/** Channels a message can be forwarded to: text channels other than its own, matching `query` by name (or id), at most 50. */
export function forwardTargets(groups: ReadonlyArray<JsGroup>, fromGroupId: string, query: string): JsGroup[] {
  const q = query.trim().toLowerCase();
  return groups
    .filter((g) => g.id !== fromGroupId && g.kind !== 'voice' && g.kind !== 'voice-sfu' && g.kind !== 'forum')
    .filter((g) => !q || (g.name ?? g.id).toLowerCase().includes(q))
    .slice(0, 50);
}
