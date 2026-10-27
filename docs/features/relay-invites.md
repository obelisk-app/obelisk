# Relay invite links

A person with a brand-new key is on no relay list and in no follow graph, so
`public.obelisk.ar` refused them everything and the app showed an empty
screen ([flow review](../operations/flow-review-2026-10-26.md)). An invite
link is the front door: open it and you land in the app, with a key made for
you, already let into the relay. You never see a code, a relay or the word
"whitelist".

The relay side (the codes, the usage rules, who may create them, the
referral tree in the relay console) is obelisk-relay's
[`docs/relay-invites.md`](https://github.com/obelisk-app/obelisk-relay/blob/main/docs/relay-invites.md).
This page is the client contract.

## The link

```
https://obelisk.ar/invite/<code>?relay=<relay host>
```

`relay` defaults to `public.obelisk.ar`. A code means nothing on any other
relay.

## Flow

| Step | Where | What |
|---|---|---|
| Keep the code | `/invite/[code]` (`page.tsx`, `RelayInviteLanding.tsx`, `useRelayInviteLanding`) | Stores `{code, relay, redeemed: []}` under `obelisk-dex/relay-invite` (`services/relay/relay-invite-storage.ts`), then `router.replace('/app?relay=<host>')`. The page ships no bridge |
| Relay trust | `/app`, `useRelayDeepLink` | The usual `?relay=` gate: silent for the current or a known relay, a question for a new one. An invite link is never a way to point someone at a relay silently |
| Its relay | `useRelayInviteRedeemer` → `enterInviteRelay` | A fresh invite (no key let in yet) on another relay: add the invite relay to the rail and switch to it. The `?relay=` deep link alone is only read by the chat shell, which a visitor with no account never mounts, so without this step the invite waited on the default relay |
| A key, if none | `RelayInviteRoot` → `useRelayInviteRedeemer` | Bridge restored, logged out, and the stored invite is fresh (no key redeemed yet): `loginWithFreshKey` makes a key and logs in with `method: 'generate'`, skipping the widget's backup steps, and publishes a random-name kind 0 like any generated account. Back up the key later in Settings |
| Redeem | `useRelayInviteRedeemer` → `redeemInvite` (`services/relay/relay-invite.ts`) | For every pubkey and relay change, if this pubkey is not in `redeemed`: sign a NIP-43 kind 28934 `["claim", code]` (`KIND_RELAY_INVITE_CLAIM`) and publish it through the page hub to the invite relay only, `authMode: 'never'` (the signature is the proof), with an 8 s ack wait |
| Admitted | same | `OK true`: add the pubkey to `redeemed`, then `switchRelay(relay)` to re-enter it, so the access verdict and every refused REQ start over |
| Refused | same | `restricted: invite unknown\|revoked\|expired\|exhausted\|inactive`: drop the stored invite and toast `common.relayInvite.dead.<reason>`. Anything else (`stale`, no answer): keep it, try again on the next change |

**Key rotation.** The stored invite survives logout (it is outside the session
record, and `resetAllClientState` does not touch it). Whatever key the person
logs in with or creates next is redeemed with the same code. Each distinct
pubkey costs the code one use; the same pubkey again costs nothing. Old keys
keep their access.

**After logout, no automatic key.** A key is made silently only while the
invite has not let any key in. Once it has, a logged-out person sees the
login screen as usual, so they can import their own key.

## Invite people (minters)

Admins of the relay, and people its operator granted a quota in the relay
console, can make links themselves.

- `useCanInvite` (`hooks/settings/invite/`) asks the relay `GET /api/invites/me`
  with a NIP-98 header (`services/relay/relay-invite-api.ts`, kind 27235
  signed through `nostrActions.signEventTemplate`). One answer per relay and
  account per visit: with an extension or a bunker each signature can be a
  prompt.
- When `can_mint` is true, Settings shows **Invite people**: desktop in the
  User group of the settings nav (`UserSettingsModal`), phone as the first
  section of the preferences screen. On any relay without the API the entry
  stays hidden.
- The panel (`components/settings/invite/RelayInviteSettings.tsx`,
  `useRelayInviteSettings`): the quota left, **Create invite link** (7-day
  link, copied on creation), and a card per link (`RelayInviteCodeCard`): its
  state, the link with **Copy link** (reads "Copied" for two seconds), how
  full it is as a bar, days left, and who joined, by name and picture
  (`useAuthor`) with when; **Turn off**. Turning a link off stops new joins; only
  the relay operator can remove people who already joined.

## Storage

| Key | Holds | Cleared |
|---|---|---|
| `obelisk-dex/relay-invite` | `{code, relay, redeemed[]}` | When the relay calls the code dead, or a new link replaces it. Not on logout, on purpose. Listed in the local-data inventory (`login`) |

## Tests

`tests/utils/relay/relay-invite.test.ts` (code cleaning, claim, refusal
parsing, URLs), `tests/services/relay/relay-invite-storage.test.ts` (fresh
invite, rotation, logout rule), `tests/services/relay/relay-invite.test.ts`
(claim goes to one relay without AUTH; OK, dead and unclear answers).

## For nostr-wot-sdk

Proposed upstream as [nostr-wot/nostr-wot-sdk#26](https://github.com/nostr-wot/nostr-wot-sdk/issues/26).

The redeem-on-every-identity-change step is the same in every client and
only needs the hub and the signer. obelisk-relay's doc §7 proposes it as
`redeemRelayInvite` in `@nostr-wot/relay` and a `pendingRelayInvite` replayed
by the `@nostr-wot/ui` session, which would let `useRelayInviteRedeemer` shrink
to a configuration line.
