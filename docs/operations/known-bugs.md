# Known Bugs & Tech Debt

Issue and debt tracking for Obelisk. Entries retain the reports and hypotheses from their original investigation; this documentation pass has not reproduced or recertified every issue. Check current code and reproduction steps before treating an old symptom or proposed fix as current behavior. Larger initiatives belong in [ROADMAP.md](../../ROADMAP.md).

## Relay reports to recheck

- **Test content on `public.obelisk.ar`** (`# Stress Test`, channels of
  `test` / `{}` / `.`). Confirmed **not** a leak: the relay answers
  unauthenticated and non-whitelisted clients with
  `auth-required: this relay only accepts whitelisted pubkeys` and serves
  zero events, so only admitted pubkeys ever see those channels. (The client
  reads that same string, arriving after a successful AUTH, as "not
  whitelisted"; the relay should send `restricted:` instead; see
  [data-system.md §5a](../architecture/data-system.md#5a-relay-side-contract-for-access-rejection).) Tidying them
  is relay-operator housekeeping, not a client change. Note that filtering
  `isHidden` groups out of the **live** stream client-side would be wrong:
  it is how members reach legitimately private channels; the cache-seed skip
  in `src/services/nostr-bridge/cache/seed.ts` exists only so hidden metadata is never painted from a
  previous identity's snapshot.

## Realtime & presence

- **Online users not updating**: all users appear online regardless of actual status. Presence state is not driven by socket connect/disconnect events.
- **Nuevo miembro no aparece en tiempo real en la member list**: when Bob joins a group where Alice is already connected, Alice does not see Bob in the sidebar until she reloads (or sends/receives a message that embeds his profile). Audit the bridge's kind 39002 (members) subscription path against `MemberList.tsx`: members arrive through the relay-wide admin/member REQ the session opens (`src/services/nostr-bridge/groups/membership/membership.ts`; group metadata ingest no longer opens a per-group one), but updates may not be triggering a re-render of the member list when the joiner has no kind:0 cached yet.
- **Lateral member list does not update per server**: switching servers must reload members, roles and online state for the server the user is now viewing.

## Rendering & UI

- **`UserPanel` ↔ `MessageInput` altura/alineación visual**: the profile bar at the bottom of `ChannelSidebar` does not line up in height with the message input bar (`px-2 md:px-4 pb-3 md:pb-4 pt-2` in both, avatar `h-8` vs textarea `rows=1`). Attempts (`leading-tight`, moving `UserPanel` in/out of the aside, `bg-lc-dark` on wrapper) leave a black strip between the channel list and the profile card. Likely fix: force explicit shared height (e.g. `h-12`) on both inner containers and ensure the `UserPanel` wrapper inherits `bg-lc-dark` from the aside without painting under the `ServerBar`.
- **Publications channels look like the opened tab even after clicking outside**: navigating from a publications channel to a regular channel does not clear its selected state in the sidebar. Does not happen between regular channels.
- **Bienvenida channel renders badly on refresh**: initial load in the welcome channel loads elements in the wrong order.
- **Bot role priority in the member list cannot be reordered**: bot sidebar position depends on role order, but /admin → Roles does not expose drag-and-drop or up/down reordering for bot roles. Fix: expose role `position` reordering (including bot-assigned roles) and have the member list respect it.
- **Anonymous name for users without server membership**: a user who logs in without joining any server shows as "Anonymous" on their own client even when their Nostr metadata has a name and picture. The /admin panel also skips their profile picture when they are not already a server member. Likely cause: profile fetch is gated on membership.
- **Mentions autocomplete leaks private/hidden channel membership**: `@user` autocomplete must filter results to users who can read the current channel. In private/hidden channels, only members with read access should appear; otherwise membership of hidden channels is inferred and mentions can be created that the target cannot see.

## Voice

- **Voice presence beacons and signaling are plaintext on the relay**: `src/services/voice/transport.ts` publishes presence beacons (kind 20078) and WebRTC signaling (kind 25050) as signed but unencrypted ephemeral events. Beacons leak `{pubkey, channelId, timestamp}` every ~15s while a user is in voice; any relay subscriber can build a real-time roster of who is in which voice channel and reconstruct session timing. Signaling events are worse: `content` is plaintext JSON containing SDP + ICE candidates, so the relay (or any subscriber filtering `kinds:[25050], #e:[channelId]`) sees codec fingerprints and harvested local/public IPs; the `#p` target is only enforced client-side (`transport.ts:144`). Media itself is fine (DTLS-SRTP peer-to-peer in mesh). Fix: wrap both kinds in NIP-59 gift-wrap (or NIP-44 to the addressed peer for signals); the transport file already flags this as a v1 shortcut. Until then, treat voice channel membership and participant IPs as public to anyone watching the relay.


## Notifications

The current foundation uses per-account client read cursors with encrypted relay synchronization, not an Obelisk server-side `lastReadAt`. Transient action feedback uses the shared ToastStack; persistent notification state, unread markers, mentions, favicon/title indicators and operating-system notifications have separate paths. See [read-state architecture](../architecture/read-state.md) and [feedback ownership](../ui/README.md#feedback-ownership). The reliability report below remains a triage item, not a finding from the toast-host consolidation.

- **General notification reliability**: notifications do not fire consistently. Needs a reproducible audit of relay event delivery, notification/read-state stores and their relevant UI or operating-system outputs against the actual triggers (new message in subscribed channel, @mention, reply to own message, DM). Specific reproduction steps to be added as they are observed.

## Proposed app integration risks

The external-app model in [obelisk-apps](https://github.com/obelisk-app/obelisk-apps) proposes kind-32390 manifests, Blossom-hosted bundles and sandboxed frames in place of built-in games. The items below are design constraints and deployment assumptions to verify before integration, not bugs in a shipped app host. See [the current games reference](../features/games.md) for implemented behavior; confirm external repository and infrastructure status when planning the migration.

- **Untrusted code near the signer.** Use an isolated frame origin with `sandbox="allow-scripts"`, without `allow-same-origin`, and an empty permissions allowlist. The host should build kind-2390 events, enforce routing tags and rate limits, and keep signers, relay URLs, group identifiers and private profile data out of the frame protocol.
- **Sandbox limits.** A frame may attempt navigation-based exfiltration or WebRTC traffic. Closing it after a second load cannot undo an outgoing request. Define what session data, participant metadata and network information an app may observe before exposing the protocol.
- **Phishing and resource abuse.** Keep trusted host branding and third-party attribution outside the frame, distinguish app-generated feedback, and unmount frames when closed. A sandbox does not stop a malicious app from asking for credentials or consuming CPU while open.
- **CSP coordination.** Any allowed frame origin, such as the proposed `https://frame.obelisk.ar`, must be reviewed in both the web client and desktop wrapper. Verify their actual policies rather than assuming they match.
- **Bundle hosting.** Confirm which Blossom servers accept JavaScript bundles; media attachment servers may reject them. Resolve bundles from manifest server hints, verify content hashes and plan mirrors or another availability strategy. A proposed single-host setup must not be mistaken for redundant storage.
- **Migration and versioning.** Define the treatment of legacy `[[game:<id>]]` events, bundle version pins and retention before removing compatibility code. Do not set a calendar-based removal deadline without verifying old event usage.
- **Performance and presentation.** Measure the first bundle download and cache reuse. Avoid a live iframe for every chat card; the proposed card can show manifest, participants and status while the active modal owns the running app.
- **Moderation.** Specify catalog trust, per-app visibility and review controls. Relay event deletion or author bans alone do not establish that an app is safe to run.
