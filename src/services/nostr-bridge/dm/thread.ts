/**
 * One decrypted DM into its thread (round 4 plan, step 15): dedupe by id,
 * replace our own optimistic placeholder in place, and raise the inbox card
 * for an incoming message the user is not watching. Both protocols' ingest
 * paths end here. Pure move from `client.ts` (`ingestDM`).
 */
import { translate } from '@/i18n/runtime';
import type { DMProtocol } from '@/store/dm';
import { useNotificationsStore } from '@/store/notifications';
import { isUserWatchingDM } from '@/services/read-gates';
import { announceIncoming } from '@/services/notifications/alert';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import type { BridgeContext } from '../context';
import { dmTagExtras } from '../event-tags';
import type { JsDirectMessage } from '../types';

export interface IngestDmParams {
  id: string;
  createdAt: number;
  plaintext: string;
  outgoing: boolean;
  counterparty: string;
  protocol: DMProtocol;
  pq: boolean;
  /** Event id to attribute the notification card to (the on-the-wire id, the gift wrap's, not the inner rumor's, for NIP-17). */
  notifyId: string;
  file?: JsDmFile;
  /** Rumor tags (NIP-17 only), custom emoji and sticker. */
  tags?: ReadonlyArray<ReadonlyArray<string>>;
  raw?: JsDirectMessage['raw'];
}

export type DmThreadContext = Pick<BridgeContext, 'dmsByPeer'>;

export interface DmThreadDeps {
  /** The echo replaced a placeholder: drop its retry args (`dm/send.ts`). */
  forgetPending(clientTag: string): void;
  ensureUserMetadata(pubkey: string): void;
  displayNameFor(pubkey: string): string;
}

export class DmThreadModule {
  constructor(
    private readonly ctx: DmThreadContext,
    private readonly deps: DmThreadDeps,
  ) {}

  ingest(params: IngestDmParams): void {
    const { id, createdAt, plaintext, outgoing, counterparty, protocol, pq, notifyId, file, tags, raw } = params;
    const dm: JsDirectMessage = {
      id,
      counterparty,
      outgoing,
      content: plaintext,
      createdAt,
      protocol,
      pq,
      ...(file ? { file } : {}),
      ...(tags && !file ? dmTagExtras(plaintext, tags) : {}),
      ...(raw ? { raw } : {}),
    };
    let isNew = false;
    let replacedClientTag: string | null = null;
    this.ctx.dmsByPeer.update((all) => {
      const existing = all[counterparty] ?? [];
      if (existing.some((m) => m.id === dm.id)) return all;
      if (outgoing) {
        // See the group messages' ingest for the rationale, replace our own
        // optimistic placeholder in place rather than appending the
        // relay-echoed copy alongside it.
        const pendingIdx = existing.findIndex(
          (m) =>
            m.pending === true
            && m.outgoing === true
            && m.content === plaintext
            && m.createdAt === dm.createdAt,
        );
        if (pendingIdx >= 0) {
          replacedClientTag = existing[pendingIdx].clientTag ?? null;
          const next = [...existing];
          next[pendingIdx] = dm;
          next.sort((a, b) => a.createdAt - b.createdAt);
          isNew = true;
          return { ...all, [counterparty]: next };
        }
      }
      isNew = true;
      return {
        ...all,
        [counterparty]: [...existing, dm].sort((a, b) => a.createdAt - b.createdAt),
      };
    });
    if (replacedClientTag) this.deps.forgetPending(replacedClientTag);
    this.deps.ensureUserMetadata(counterparty);
    // DM notification for incoming DMs the user isn't actively watching.
    // Kept in its own stream, with its own cursor (`inboxLastReadAt`), so
    // clearing DMs never touches channel mentions. Unread *counts* still
    // come from the read-state cursor + bridge `dmsByPeer`; this only
    // pushes a card for the bell / mobile inbox.
    //
    // Relay-agnostic on purpose: DMs are the one thing that runs
    // cross-relay (NIP-65 read+write union), so they are not scoped to
    // the active relay the way mentions are.
    if (!isNew || outgoing) return;
    if (isUserWatchingDM(counterparty)) return;
    const added = useNotificationsStore.getState().pushDmNotification({
      id: notifyId,
      senderPubkey: counterparty,
      // A file message's `content` is a Blossom URL; the card shows the
      // filename instead (or nothing, the UI labels it an attachment).
      preview: file ? (file.name ?? '') : plaintext.slice(0, 280),
      createdAt: createdAt * 1000,
    });
    if (!added) return;
    announceIncoming({
      kind: 'dm',
      id: notifyId,
      createdAt: createdAt * 1000,
      title: this.deps.displayNameFor(counterparty),
      // The OS shade is visible to anyone looking at the screen and may be
      // mirrored to other devices; never put DM plaintext there.
      body: translate('common.ping.newDm'),
    });
  }
}
