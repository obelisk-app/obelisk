/**
 * The DM half of the bridge's wiring: the relay lookups, the send path, the
 * two protocols, the thread ingest, call control, the inbox REQs and the
 * encrypted store that keeps opened messages (`dm/store.ts`), each
 * handed the narrow callbacks it needs into the rest of the bridge
 * (`./compose.ts`). Moved from the facade's constructor.
 */
import { rememberDmConversation } from '@/services/chat/dm/conversations';
import { DmCallsModule } from '../dm/calls';
import { DmInboxModule } from '../dm/inbox';
import { Nip04Module } from '../dm/nip04';
import { Nip17SendModule } from '../dm/nip17';
import { DmRelaysModule } from '../dm/relays';
import { DmSendModule, type SettledDm } from '../dm/send';
import { DmStoreModule } from '../dm/store';
import { DmThreadModule, type IngestDmParams } from '../dm/thread';
import { getPreferences } from '@/services/preferences/preferences';
import type { BridgeModules } from './compose';
import { buildNipSigner } from '../session/nip-signer';

export class DmModules {
  readonly dmRelays: DmRelaysModule;
  readonly dmSend: DmSendModule;
  readonly nip17: Nip17SendModule;
  readonly dmThread: DmThreadModule;
  readonly nip04: Nip04Module;
  readonly dmCalls: DmCallsModule;
  readonly dmInbox: DmInboxModule;
  readonly dmStore: DmStoreModule;

  constructor(private readonly m: BridgeModules) {
    const remember = (params: IngestDmParams) => rememberDmConversation(this.m.state.session?.pubKeyHex ?? null, params.counterparty, params.createdAt);
    this.dmStore = new DmStoreModule({
      // Interactive lane: the person just opened their DMs and is waiting.
      nipSigner: () => buildNipSigner(this.m.state.session, this.m.bunker, 'interactive', this.m.state.captureSessionGuard()),
      replay: (params) => { remember(params); this.dmThread.ingest(params, { replay: true }); },
      reingest: (ev, kind) => (kind === 'wrap' ? this.dmInbox.ingestGiftWrap(ev) : this.nip04.ingestIncoming(ev)),
      dmsEnabled: () => getPreferences().directMessagesEnabled,
    });
    // Every message opened from a relay goes to its thread and into the store.
    const ingestDM = (params: IngestDmParams) => {
      remember(params);
      this.dmThread.ingest(params);
      this.dmStore.save(params);
    };
    const rememberOwn = (params: IngestDmParams) => { remember(params); this.dmStore.save(params); };
    const holdLocked = (kind: 'wrap' | 'nip04') => (ev: Parameters<DmStoreModule['hold']>[0]) => {
      const account = this.m.state.session?.pubKeyHex ?? null;
      if (kind === 'nip04' && account) {
        const peer = ev.pubkey === account ? ev.tags.find((t) => t[0] === 'p')?.[1] : ev.pubkey;
        if (peer) rememberDmConversation(account, peer, ev.created_at);
      }
      return this.dmStore.hold(ev, kind);
    };
    const isStored = (wireId: string) => this.dmStore.knows(wireId);
    this.dmRelays = new DmRelaysModule(this.m.ctx, {
      dmSigner: () => this.m.dmSigner(),
      publishSignedEvent: (ev, relays, opts) => this.m.publisher.publishSignedEvent(ev, relays, opts),
    });
    const ownInbox = () => Array.from(new Set([...this.m.state.relays, ...this.dmRelays.mine()]));
    const dmSettle = {
      replacePending: (counterparty: string, clientTag: string, params: SettledDm, plaintext: string) =>
        this.dmSend.replacePending(counterparty, clientTag, params, plaintext),
      markFailed: (counterparty: string, clientTag: string) => this.dmSend.markFailed(counterparty, clientTag),
    };
    this.dmSend = new DmSendModule(this.m.ctx, {
      publishNip04: (send) => this.nip04.publish(send),
      publishNip17: (send) => this.nip17.publish(send),
      ensureUserMetadata: (pubkey) => this.m.profiles.ensure(pubkey),
    });
    this.nip17 = new Nip17SendModule(this.m.ctx, {
      dmSigner: () => this.m.dmSigner(),
      resolveGiftWrapRelays: (pubkey) => this.dmRelays.resolveGiftWrapRelays(pubkey),
      publishSignedEvent: (ev, relays, opts) => this.m.publisher.publishSignedEvent(ev, relays, opts),
      ownInbox,
      settle: dmSettle,
      rememberOwn,
    });
    this.dmThread = new DmThreadModule(this.m.ctx, {
      forgetPending: (clientTag) => this.dmSend.forgetPending(clientTag),
      ensureUserMetadata: (pubkey) => this.m.profiles.ensure(pubkey),
      displayNameFor: (pubkey) => this.m.profiles.displayNameFor(pubkey),
    });
    this.nip04 = new Nip04Module(this.m.ctx, {
      withBunkerSigner: (operation, opts) => this.m.bunker.run(operation, opts),
      fetchRecipientReadRelays: (pubkey) => this.dmRelays.fetchRecipientReadRelays(pubkey),
      decrypt: (sender, ciphertext, lane) => this.m.seams.decryptNip04(sender, ciphertext, lane),
      generation: () => this.m.connection.generation,
      ingestDM,
      settle: dmSettle,
      holdLocked: holdLocked('nip04'),
      onDecryptFailure: (ev) => { this.dmStore.hold(ev, 'nip04', true); },
      isStored,
      alertLocked: (ev) => this.dmThread.alertLocked(ev),
      rememberOwn,
    });
    this.dmCalls = new DmCallsModule(this.m.ctx, {
      dmSigner: () => this.m.dmSigner(),
      resolveGiftWrapRelays: (pubkey) => this.dmRelays.resolveGiftWrapRelays(pubkey),
      publishSignedEvent: (ev, relays, opts) => this.m.publisher.publishSignedEvent(ev, relays, opts),
      ownInbox,
    });
    this.dmInbox = new DmInboxModule(this.m.ctx, {
      acquireDmLease: (relay) => this.m.hub.acquireAuthLease(relay, 'dm'),
      fetchMyDmRelays: () => this.dmRelays.fetchMine(),
      setMyDmRelays: (relays) => this.dmRelays.setMine(relays),
      resetDmRelays: () => this.dmRelays.reset(),
      dmSigner: (pqTrack, lane) => this.m.dmSigner(pqTrack, lane),
      generation: () => this.m.connection.generation,
      ingestNip04: (ev) => this.nip04.ingestIncoming(ev),
      ingestCall: (message, sender) => this.dmCalls.ingest(message, sender),
      ingestDM,
      holdLocked: holdLocked('wrap'),
      onDecryptFailure: (ev) => { this.dmStore.hold(ev, 'wrap', true); },
      isStored,
    });
  }
}
