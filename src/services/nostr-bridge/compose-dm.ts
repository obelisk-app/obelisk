/**
 * The DM half of the bridge's wiring: the relay lookups, the send path, the
 * two protocols, the thread ingest, call control and the inbox REQs, each
 * handed the narrow callbacks it needs into the rest of the bridge
 * (`./compose.ts`). Moved from the facade's constructor.
 */
import { DmCallsModule } from './dm/calls';
import { DmInboxModule } from './dm/inbox';
import { Nip04Module } from './dm/nip04';
import { Nip17SendModule } from './dm/nip17';
import { DmRelaysModule } from './dm/relays';
import { DmSendModule, type SettledDm } from './dm/send';
import { DmThreadModule } from './dm/thread';
import type { BridgeModules } from './compose';

export class DmModules {
  readonly dmRelays: DmRelaysModule;
  readonly dmSend: DmSendModule;
  readonly nip17: Nip17SendModule;
  readonly dmThread: DmThreadModule;
  readonly nip04: Nip04Module;
  readonly dmCalls: DmCallsModule;
  readonly dmInbox: DmInboxModule;

  constructor(private readonly m: BridgeModules) {
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
      ingestDM: (params) => this.dmThread.ingest(params),
      settle: dmSettle,
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
      ingestDM: (params) => this.dmThread.ingest(params),
    });
  }
}
