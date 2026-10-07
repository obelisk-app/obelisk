/**
 * The channel list's empty-EOSE ladder (kind 39000). An empty EOSE is
 * provisional: some relays answer the global channel-list REQ before AUTH /
 * whitelist evaluation has fully settled, then deliver metadata on a later
 * request. The sidebar stays in "Loading channels..." for a bounded retry
 * window (one focused query per step) instead of painting "No channels" at
 * once. Pure move from `groups/metadata.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_GROUP_METADATA } from '@/utils/nostr/nip-kinds';
import type { BridgeContext } from '../../facade/context';
import type { StateStore } from '../../common/state-store';
import type { JsGroup } from '../../common/types';

export type MetadataEoseContext = Pick<BridgeContext, 'session' | 'relays' | 'currentRelayUrl' | 'queryRelaysWithConfidence'>;

export interface MetadataEoseStores {
  readonly groups: StateStore<JsGroup[]>;
  readonly groupMetadataEose: StateStore<boolean>;
  ingest(ev: NostrEvent): void;
}

export class MetadataEoseLadder {
  private static readonly EMPTY_RETRY_DELAYS = [1500, 3000, 5000] as const;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;

  constructor(
    private readonly ctx: MetadataEoseContext,
    private readonly stores: MetadataEoseStores,
  ) {}

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.attempts = 0;
  }

  handleEose(): void {
    if (this.stores.groups.get().length > 0) {
      this.clear();
      this.stores.groupMetadataEose.set(true);
      return;
    }
    if (this.attempts >= MetadataEoseLadder.EMPTY_RETRY_DELAYS.length) {
      this.clear();
      this.stores.groupMetadataEose.set(true);
      return;
    }
    this.stores.groupMetadataEose.set(false);
    const delay = MetadataEoseLadder.EMPTY_RETRY_DELAYS[this.attempts];
    this.attempts += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.querySyncFallback();
    }, delay);
  }

  private async querySyncFallback(): Promise<void> {
    if (!this.ctx.session()) return;
    const relay = this.ctx.currentRelayUrl.get();
    const relays = [...this.ctx.relays()];
    let events: NostrEvent[];
    try {
      // Bypass the result cache: each rung of this ladder runs because the
      // previous answer was empty, and a cached empty would make every
      // later rung a no-op.
      const result = await this.ctx.queryRelaysWithConfidence(relays, { kinds: [KIND_GROUP_METADATA] }, 6000, { cache: 'bypass' });
      events = result.events;
      if (events.length === 0 && !result.complete) return;
    } catch {
      if (!this.ctx.session() || this.ctx.currentRelayUrl.get() !== relay) return;
      this.handleEose();
      return;
    }
    if (!this.ctx.session() || this.ctx.currentRelayUrl.get() !== relay) return;
    for (const ev of events) this.stores.ingest(ev);
    if (this.stores.groups.get().length > 0) {
      this.clear();
      this.stores.groupMetadataEose.set(true);
      return;
    }
    this.handleEose();
  }
}
