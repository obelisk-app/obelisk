import type { CommunityState, Rumor } from '@applesauce/concord';
import { newestValidEdit, rumorMs, vacVerifier, parseImeta } from '@applesauce/concord/helpers';
import { PERM } from '@/constants/chat/concord';
import { KIND_COMMENT, KIND_EVENT_DELETION, KIND_GROUP_CHAT_MESSAGE, KIND_REACTION } from '@/constants/nostr/nip-kinds';

/** Inputs have passed the SDK's envelope, binding, expiry and current-ban checks. */
export function projectConcordTimeline(rumors: readonly Rumor[], state: CommunityState, channelId: string) {
  const byId = new Map(rumors.map(rumor => [rumor.id, rumor]));
  const deleted = new Set<string>();
  for (const rumor of rumors) {
    if (rumor.kind !== KIND_EVENT_DELETION) continue;
    const vac = rumor.tags.find(tag => tag[0] === 'vac');
    const evidence: [string, string, string] | undefined = vac?.length === 4 ? [vac[1], vac[2], vac[3]] : undefined;
    for (const tag of rumor.tags) {
      if (tag[0] !== 'e') continue;
      const target = byId.get(tag[1]);
      if (target && (target.pubkey === rumor.pubkey || vacVerifier(state, PERM.MANAGE_MESSAGES, target.pubkey)(rumor.pubkey, evidence))) deleted.add(target.id);
    }
  }
  return rumors.filter(rumor => [KIND_GROUP_CHAT_MESSAGE, KIND_COMMENT].includes(rumor.kind) && !deleted.has(rumor.id))
    .sort((a, b) => rumorMs(a) - rumorMs(b) || a.id.localeCompare(b.id))
    .map(rumor => {
      const edit = newestValidEdit(rumor, rumors, { channelId, deletions: rumors, isBanned: pubkey => state.banlist.has(pubkey) });
      const reactions = new Map<string, Set<string>>();
      for (const reaction of rumors) {
        if (reaction.kind !== KIND_REACTION || deleted.has(reaction.id) || !reaction.tags.some(tag => tag[0] === 'e' && tag[1] === rumor.id)) continue;
        const authors = reactions.get(reaction.content) ?? new Set<string>();
        authors.add(reaction.pubkey);
        reactions.set(reaction.content, authors);
      }
      const reactionEvents = rumors.filter(reaction => reaction.kind === KIND_REACTION && !deleted.has(reaction.id) && reaction.tags.some(tag => tag[0] === 'e' && tag[1] === rumor.id));
      return { rumor, reactionEvents, subject: rumor.tags.find(tag => tag[0] === 'subject')?.[1], attachments: [...parseImeta(rumor.tags).values()], content: edit?.content ?? rumor.content, reactions: [...reactions].map(([emoji, authors]) => ({ emoji, count: authors.size })) };
    });
}
