import { extractMentionPubkeysFromMessage } from '@/utils/message-text/mentions';
import { awaitConcordSendReady } from './send-readiness';
import { BehaviorSubject } from 'rxjs';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { ChatMessageFactory, CommentFactory } from 'applesauce-common/factories';
import { addMediaAttachments } from 'applesauce-common/operations/media-attachment';
import type { Rumor } from '@applesauce/concord';
import { bindToChannel, includeMediaEncryption } from '@applesauce/concord/operations';
import { getEventHash, type EventTemplate } from 'nostr-tools';
import type { JsMessage } from '@/services/nostr-bridge';
import type { MediaAttachment } from '@applesauce/concord/helpers';
import { CONCORD_ATTACHMENT_BYTE_LIMIT } from '@/constants/nostr-bridge/concord';
import { concordUploader } from './media';

export interface ConcordPendingMessage {
  message: JsMessage;
  channelId: string;
  thread?: Rumor;
  replyParent?: Rumor;
  files: File[];
  reply: { id: string; pubkey: string } | null;
  previews: string[];
  phase: 'encrypting' | 'uploading' | 'sending' | 'failed';
  attachments: MediaAttachment[];
  prepared?: EventTemplate;
  epoch?: number;
  rumorId?: string;
}
const boxes = new WeakMap<ConcordCommunity, ConcordOutbox>();

/** Memory-only pending sends; the bridge runtime destroys them on account disposal. */
export class ConcordOutbox {
  readonly rows$ = new BehaviorSubject<ConcordPendingMessage[]>([]);
  private active = true;
  constructor(private community: ConcordCommunity) {}
  private assertCurrent = () => { if (!this.active) throw new Error('Session ended'); };
  private update(row: ConcordPendingMessage, phase: ConcordPendingMessage['phase']) {
    if (!this.active) return;
    row.phase = phase;
    row.message = { ...row.message, pending: phase !== 'failed', failed: phase === 'failed' };
    this.rows$.next([...this.rows$.value]);
  }
  enqueue(channelId: string, content: string, reply: { id: string; pubkey: string } | null, files: File[], thread?: Rumor, replyParent?: Rumor) {
    this.assertCurrent();
    if (this.rows$.value.length >= 10) throw new Error('Pending attachment limit exceeded');
    const retainedBytes = this.rows$.value.flatMap(row => row.files).reduce((sum, file) => sum + file.size, 0);
    if (retainedBytes + files.reduce((sum, file) => sum + file.size, 0) > CONCORD_ATTACHMENT_BYTE_LIMIT * 2) throw new Error('Pending attachment limit exceeded');
    const id = `pending:${crypto.randomUUID()}`;
    const row: ConcordPendingMessage = {
      channelId, files, reply, thread, replyParent, attachments: [], phase: files.length ? 'encrypting' : 'sending',
      previews: files.map(file => URL.createObjectURL(file)),
      message: { id, clientTag: id, pubkey: this.community.pubkey, content, createdAt: Math.floor(Date.now() / 1000),
        kind: thread ? 1111 : 9, replyToId: reply?.id ?? thread?.id ?? null, mentions: [], pending: true },
    };
    this.rows$.next([...this.rows$.value, row]);
    void this.deliver(row, reply);
  }
  private async deliver(row: ConcordPendingMessage, reply?: { id: string; pubkey: string } | null) {
    try {
      const uploader = concordUploader(this.assertCurrent);
      for (let index = row.attachments.length; index < row.files.length; index++) {
        row.attachments.push(await uploader.upload(row.files[index], this.community.communityId, {
          onProgress: phase => this.update(row, phase === 'encrypting' ? 'encrypting' : 'uploading'),
        }));
      }
      this.assertCurrent();
      this.update(row, 'sending');
      await awaitConcordSendReady(this.community);
      this.assertCurrent();
      const epoch = this.community.material.channels.find(channel => channel.id === row.channelId)?.epoch ?? this.community.material.root_epoch;
      if (!row.prepared) {
        const text = [row.message.content, ...row.attachments.map(file => file.url)].filter(Boolean).join('\n');
        let draft;
        if (row.thread) draft = await CommentFactory.create(row.replyParent ?? row.thread, text);
        else {
          let factory = ChatMessageFactory.create(text);
          if (reply) factory = factory.replyTo({ id: reply.id, author: reply.pubkey });
          draft = await factory;
        }
        const mentioned = extractMentionPubkeysFromMessage(row.message.content, draft.tags);
        for (const pubkey of mentioned) if (!draft.tags.some(tag => tag[0] === 'p' && tag[1] === pubkey)) draft.tags.push(['p', pubkey]);
        if (row.attachments.length) draft = await addMediaAttachments(row.attachments)(draft);
        row.prepared = await includeMediaEncryption(row.attachments.filter(file => file.url && file.encryption).map(file => ({ url: file.url!, ...file.encryption! })))(
          await bindToChannel(row.channelId, epoch)(draft));
        row.epoch = epoch;
        row.rumorId = getEventHash({ ...row.prepared, pubkey: this.community.pubkey });
        this.update(row, 'sending');
      }
      // Keep the exact rumor on retry, including its timestamp: partial relay success cannot duplicate it.
      if (row.epoch !== epoch) throw new Error('Channel keys changed; resend this message');
      await this.community.publishToPlane({ plane: 'channel', channelId: row.channelId }, row.prepared, {
        requiredAckStage: 'message-send', assertCurrent: () => {
          this.assertCurrent();
          const currentEpoch = this.community.material.channels.find(channel => channel.id === row.channelId)?.epoch ?? this.community.material.root_epoch;
          if (currentEpoch !== row.epoch) throw new Error('Channel keys changed; resend this message');
        },
      });
      this.dismiss(row.message.id);
    } catch { this.update(row, 'failed'); }
  }
  retry(id: string) {
    const row = this.rows$.value.find(item => item.message.id === id);
    if (!row || row.phase !== 'failed') return;
    this.update(row, 'sending');
    void this.deliver(row, row.reply);
  }
  dismiss(id: string) {
    const row = this.rows$.value.find(item => item.message.id === id);
    if (row) for (const url of row.previews) URL.revokeObjectURL(url);
    this.rows$.next(this.rows$.value.filter(item => item.message.id !== id));
  }
  dispose() {
    this.active = false;
    for (const row of this.rows$.value) for (const url of row.previews) URL.revokeObjectURL(url);
    this.rows$.next([]);
    this.rows$.complete();
  }
}
export function concordOutbox(community: ConcordCommunity) {
  let box = boxes.get(community);
  if (!box) { box = new ConcordOutbox(community); boxes.set(community, box); }
  return box;
}
export function disposeConcordOutbox(community: ConcordCommunity) {
  boxes.get(community)?.dispose();
  boxes.delete(community);
}
