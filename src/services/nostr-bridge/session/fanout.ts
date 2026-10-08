/**
 * The session's REQ fan-out on the active relay (docs/architecture/data-system.md §4):
 * the P0 tier at once, the P2 tier on the next microtask, then the
 * per-group REQs a session or relay reset released, the channel in view
 * first. Pure move from `client.ts` (`openSessionSubscriptions`,
 * `reissuePerGroup`). Called from `connect()` only; the hub's registry
 * orders the wire the same way and re-issues all of it on every later
 * socket generation by itself.
 */

/**
 * The per-group REQs a session or relay reset closed and the fan-out that
 * follows it reopens. They are owned by mounted components that called
 * `subscribeMessages` / `subscribeAdminMember` / `ensureUserMetadata` once
 * on mount and keep their store listeners wired, so nothing re-calls them.
 * A socket drop needs no such list: the hub's registry keeps those REQs and
 * re-issues them on the next socket generation.
 */
export interface PerGroupReqs {
  messages: string[];
  reactions: string[];
  adminMember: string[];
  metadata: string[];
}

/** What the fan-out opens, module by module, in tier order. */
export interface FanoutTargets {
  myPubkey(): string | null;
  access: { preflight(): void };
  metadata: { subscribe(): void };
  membership: { subscribeRelayWide(): void; subscribeMyAuthoredGroups(): void; ensurePerGroup(groupId: string): void };
  lists: { subscribeContactList(): void; subscribeMuteList(): void };
  media: { subscribe(): void };
  voicePresence: { subscribe(): void };
  pings: { subscribeLivePings(): void };
  reactions: { ensurePerGroup(groupId: string): void };
  ensureUserMetadata(pubkey: string): void;
  /** The channel in view, which goes first among the reopened message REQs. */
  activeGroupId(): string | null;
  subscribeGroupMessages(groupId: string): void;
  dmInbox: { readonly wanted: boolean; readonly subscribed: boolean; subscribe(): void };
}

export function openSessionSubscriptions(t: FanoutTargets, perGroup: PerGroupReqs | null): void {
  // The standard relay path is authoritative and must not wait behind
  // optional HTTP bootstrap discovery/signing.
  t.access.preflight();
  t.metadata.subscribe();
  const me = t.myPubkey();
  if (me) t.ensureUserMetadata(me);
  queueMicrotask(() => {
    t.membership.subscribeRelayWide();
    t.lists.subscribeContactList();
    t.media.subscribe();
    t.lists.subscribeMuteList();
    t.membership.subscribeMyAuthoredGroups();
    t.voicePresence.subscribe();
    t.pings.subscribeLivePings();
    // Reopen the per-group REQs the reset released. Components that
    // mounted pre-login (or pre-relay-switch) still have their store
    // listeners wired up; without this nothing feeds them and the data
    // only appears after a manual refresh. After the global REQs on purpose.
    reissuePerGroup(t, perGroup);
    // Reopen DM REQs the reset closed; see `DmInboxModule.wanted`.
    if (t.dmInbox.wanted && !t.dmInbox.subscribed) t.dmInbox.subscribe();
  });
}

/**
 * Reopen the per-group REQs a session or relay reset released. The active
 * group is bumped to the head of the messages list so that, after a relay
 * or session swap, the channel currently in view gets the relay's first
 * per-group response. No-op when there is nothing to reopen.
 */
function reissuePerGroup(t: FanoutTargets, pending: PerGroupReqs | null): void {
  if (!pending) return;
  const messages = [...pending.messages];
  const active = t.activeGroupId();
  if (active) {
    const idx = messages.indexOf(active);
    if (idx > 0) {
      messages.splice(idx, 1);
      messages.unshift(active);
    }
  }
  messages.forEach((id) => t.subscribeGroupMessages(id));
  pending.reactions.forEach((id) => t.reactions.ensurePerGroup(id));
  pending.adminMember.forEach((id) => t.membership.ensurePerGroup(id));
  pending.metadata.forEach((pk) => t.ensureUserMetadata(pk));
}
