/**
 * The relay rail and the relay being browsed (round 4 plan, the facade's
 * relay half): the configured list restored from storage and kept in it,
 * and the switch that moves the whole session onto another relay. Groups
 * bind to the active relay only (AGENTS.md "Single-relay rule"), so a
 * switch releases every group REQ, clears every relay-scoped store
 * (`./reset.ts`), repaints from the new relay's cache and reconnects. Pure
 * move from `client.ts`.
 */
import { useNotificationsStore } from '@/store/notifications';
import {
  DEFAULT_RELAYS,
  isImportableRelayUrl,
  normalizeConfiguredRelayUrl,
  uniqueRelayUrls,
  validateRelayUrl,
} from '../relay-list';
import { normalizeRelayUrl } from '../relay-url';
import { LEGACY_RELAYS_KEY, RELAYS_KEY, readMigrated } from '../session-storage';
import { RELAY_SWITCH_GRACE_MS } from '../subscriptions/pinned';
import type { PerGroupReqs } from './fanout';
import type { LifecycleTargets } from './lifecycle';
import { resetRelayScopedState } from './reset';

export interface RelayRailDeps {
  connect(perGroup: PerGroupReqs | null): Promise<void>;
  /** Write the session to storage (`./login.ts`). */
  persist(): void;
}

export class RelayRail {
  constructor(
    private readonly t: LifecycleTargets & { readonly hub: { disconnect(url: string, opts?: { graceMs?: number }): void } },
    private readonly deps: RelayRailDeps,
  ) {}

  /** Restore the rail from storage, merging the defaults back in (page load). */
  restore(): void {
    if (typeof window === 'undefined') return;
    const rawRelays = readMigrated(RELAYS_KEY, LEGACY_RELAYS_KEY);
    if (!rawRelays) return;
    try {
      const list = JSON.parse(rawRelays) as string[];
      if (Array.isArray(list) && list.length > 0) {
        const merged = uniqueRelayUrls(list);
        let mutated = merged.length !== list.length || merged.some((url, i) => url !== list[i]);
        for (const def of DEFAULT_RELAYS) {
          const normalizedDefault = normalizeRelayUrl(def);
          if (!merged.includes(normalizedDefault)) {
            merged.push(normalizedDefault);
            mutated = true;
          }
        }
        this.t.state.configuredRelays.set(merged);
        if (mutated) {
          window.localStorage.setItem(RELAYS_KEY, JSON.stringify(merged));
        }
      }
    } catch {
      // ignore
    }
  }

  ensureRelayInList(url: string): void {
    const configured = this.t.state.configuredRelays;
    const normalized = normalizeConfiguredRelayUrl(url);
    const list = configured.get();
    if (list.includes(normalized)) return;
    const next = uniqueRelayUrls([...list, normalized]);
    configured.set(next);
    this.persistRelays();
  }

  private persistRelays(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RELAYS_KEY, JSON.stringify(this.t.state.configuredRelays.get()));
  }

  async switchRelay(url: string): Promise<void> {
    const { t } = this;
    const { state } = t;
    const normalized = normalizeConfiguredRelayUrl(url);
    validateRelayUrl(normalized);
    if (!isImportableRelayUrl(normalized)) throw new Error("relay URL must be a public wss:// hostname");
    const previousRelays = [...state.relays];
    t.connection.generation++;
    // Preserve only the mounted channel. Background subscriptions belong to
    // the old relay and reopening them here can exhaust the new relay quota.
    const activeGroup = t.messages.activeGroupId();
    const perGroup: PerGroupReqs | null = activeGroup ? {
      messages: [activeGroup],
      reactions: t.reactions.hasPerGroup(activeGroup) ? [activeGroup] : [],
      adminMember: t.membership.hasPerGroup(activeGroup) ? [activeGroup] : [],
      metadata: [],
    } : null;
    t.reqs.closeAll();
    t.dmInbox.dropHandles();
    t.connection.forgetSocketsUp();
    // The relay being left keeps its socket (and its AUTH) for a grace
    // window, so A -> B -> A costs no handshake and no prompt. Its lease goes
    // now: while not browsed it answers no new challenge.
    state.relays = [normalized];
    t.connection.syncActiveRelayLease();
    for (const previous of previousRelays) {
      if (normalizeRelayUrl(previous) === normalized) continue;
      t.hub.disconnect(previous, { graceMs: RELAY_SWITCH_GRACE_MS });
    }
    state.currentRelayUrl.set(normalized);
    // Stamp the mention floor before the new relay's subscriptions open.
    // A relay seen before keeps its stored cursor, so cached mentions stay
    // unread; a brand-new relay starts from "now" and ignores its history.
    useNotificationsStore.getState().registerRelay(normalized);
    this.ensureRelayInList(normalized);
    // The relay we just left joins the background watch; the one we just
    // opened leaves it (its full ingest now runs on the session's sockets).
    t.pings.recordRelayUse(normalized);
    t.pings.syncBackgroundWatch();
    if (state.session) state.session.relayUrl = normalized;
    this.deps.persist();
    resetRelayScopedState(t);
    // Re-paint instantly from disk for the new relay; live events will
    // overwrite as they arrive.
    t.seedCacheForRelay(normalized);
    try {
      await this.deps.connect(perGroup);
      void t.profiles.syncOwn('switch');
    } catch {
      // The handshake failed. The hub keeps the socket held and retries with
      // its backoff, and its registry issues the pending REQs when it
      // reports `connected`. Nothing to schedule here.
    }
  }

  async addRelay(url: string): Promise<void> {
    const trimmed = normalizeConfiguredRelayUrl(url);
    if (!trimmed) return;
    validateRelayUrl(trimmed);
    if (!isImportableRelayUrl(trimmed)) throw new Error("relay URL must be a public wss:// hostname");
    // Register in the rail only, do NOT add it to the active relay list.
    // NIP-29 channels are per-relay, so subscribing to multiple relays
    // simultaneously mixes channels from different servers into the same
    // `groups` store and the "Uncategorized" bucket. `switchRelay(url)` is
    // the single path that activates a relay; the rail tile click-handler
    // calls it explicitly. Without this scoping, the session fan-out would
    // subscribe kind 39000 against every relay the user had ever added.
    this.ensureRelayInList(trimmed);
  }

  async removeRelay(url: string): Promise<void> {
    const { state } = this.t;
    const normalized = normalizeConfiguredRelayUrl(url);
    const list = state.configuredRelays.get().filter((u) => normalizeRelayUrl(u) !== normalized);
    if (list.length === 0) return; // never empty the rail
    state.configuredRelays.set(list);
    this.persistRelays();
    this.t.pings.syncBackgroundWatch();
    if (normalizeRelayUrl(state.currentRelayUrl.get()) === normalized) {
      await this.switchRelay(list[0]);
    }
  }
}
