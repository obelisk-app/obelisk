import { awaitConcordSendReady } from './send-readiness';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { ChatMessageFactory } from 'applesauce-common/factories';
import { bindToChannel, includeSubject } from '@applesauce/concord/operations';
import { assertSubject } from '@applesauce/concord/helpers';
import type { EventTemplate } from 'nostr-tools';
import { concordThreadId } from '@/utils/chat/concord/publications';

type Pending = { key: string; epoch: number; template: Promise<EventTemplate>; sending?: Promise<string> };
const pending = new WeakMap<ConcordCommunity, Map<string, Pending>>();
/** Native Concord titled kind 9. A failed acknowledgement retries the same rumor. */
export async function createConcordPublication(community: ConcordCommunity, channelId: string, title: string, body: string) {
  assertSubject(title.trim());
  await awaitConcordSendReady(community);
  const epoch = () => community.material.channels.find(channel => channel.id === channelId)?.epoch ?? community.material.root_epoch;
  let drafts = pending.get(community);
  if (!drafts) { drafts = new Map(); pending.set(community, drafts); }
  const key = JSON.stringify([title.trim(), body.trim()]);
  let draft = drafts.get(channelId);
  if (!draft || draft.key !== key) {
    if (drafts.size >= 8) drafts.delete(drafts.keys().next().value!);
    const currentEpoch = epoch();
    draft = { key, epoch: currentEpoch, template: ChatMessageFactory.create(body.trim()).then(async event => bindToChannel(channelId, currentEpoch)(await includeSubject(title.trim())(event))) };
    drafts.set(channelId, draft);
  }
  const current = draft;
  const assertCurrent = () => { if (epoch() !== current.epoch) throw new Error('Channel keys changed; recreate this publication'); };
  if (!current.sending) current.sending = current.template.then(async template => {
    assertCurrent();
    const id = await community.publishToPlane({ plane: 'channel', channelId }, template, { requiredAckStage: 'publication-create', assertCurrent });
    if (drafts.get(channelId) === current) drafts.delete(channelId);
    return concordThreadId(`concord:${community.communityId}:${channelId}`, id);
  }).finally(() => { current.sending = undefined; });
  return current.sending;
}
