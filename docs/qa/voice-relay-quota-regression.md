# Voice Relay Quota Regression QA

Purpose: verify that normal app startup stays under public relay subscription quota and that voice mesh signaling keeps reserved capacity.

> Written in 2026-09, before the RelayHub. Since then every REQ, voice included, rides the hub's shared registry, which re-issues in priority order (`voice > active > dm > background`) and parks quota-closed subs itself. The bridge no longer has `reserveVoiceRelayCapacity` (voice's `relay-prep.ts` still asks for it and gets nothing), and a mesh call leaves lazy admin/member subs open (`bridge-voice.test.ts`). The commands below are updated to the split bridge suites.

## Context

The production stop-the-bleeding fix cleaned up `CLOSED restricted: Subscription quota exceeded: 50/50` watched subscriptions after the relay rejected them. This architecture pass reduces the original fanout:

- metadata discovery no longer implies unbounded per-group message/admin/member/reaction/deletion/creator REQs
- passive background message streams are capped at 8
- active/visible channels still subscribe immediately
- lazy admin/member subscriptions were closed when voice reserved capacity (no longer: see the note above)
- quota cleanup only closes live subscription handles and clears subscription bookkeeping; it never deletes cached/user-visible messages, channels, metadata, admins, or members
- WoT/mute/block verdicts may drive UI policy, but they no longer auto-prune bridge data
- the relay-access preflight REQ stays bounded to `authors=[me], limit=1` and remains available for an immediate EOSE-then-CLOSED auth-required downgrade

Voice signaling runs on the same hub sockets as the session, so the main bridge still needs to leave headroom because chat, membership, and voice UI are often mounted together.

## Test Commands

Run from the repo root.

Target the bounded fanout and quota cleanup behavior:

```bash
npx vitest run tests/services/nostr-bridge/bridge-relay-access.test.ts tests/services/nostr-bridge/bridge-messages.test.ts tests/services/nostr-bridge/bridge-voice.test.ts -t "frees the group slot|preflight relay-access|lazy admin/member|caps background message streams"
```

Target appearance preferences:

```bash
npx vitest run tests/services/preferences/preferences.test.ts tests/components/settings/appearance/AppearancePreferenceControls.test.tsx "tests/app/[locale]/app/user-panel/UserPanel.preferences.test.tsx"
```

Run bridge and voice transport together:

```bash
npx vitest run tests/services/nostr-bridge/bridge-voice.test.ts tests/services/voice/transport.test.ts
```

Run the full unit suite:

```bash
npm test -- --run
```

Build:

```bash
npm run build
```

## Manual Checks

1. Log in on `wss://public.obelisk.ar` with an account that can see many channels.
2. Confirm startup does not emit a burst of `Subscription quota exceeded: 50/50` logs during normal background hydration.
3. Open a busy text channel and confirm messages load without waiting for all background channels.
4. Join a mesh voice channel and confirm presence and signaling subscriptions are accepted.
5. Open desktop Preferences and change accent, background, and button colors.
6. Repeat the same appearance changes from the mobile Preferences screen.
7. Reload and confirm colors persist; use Reset appearance and confirm defaults return.

Known benign stderr during tests:

- `AudioContext is not supported in this environment` from jsdom voice tests
- intentional malformed signal parse warnings
- intentional SFU retry/failure-handler warnings

Treat Vitest or Next build non-zero exit codes as failures.
