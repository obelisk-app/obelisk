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
| Relay trust | `/app`, `useRelayDeepLink` (logged in) or `useRelayInviteRedeemer` → `steerToInviteRelay` (logged out) | A fresh invite (no key let in yet) for another relay: switch silently only when that relay is in the person's list or a built-in default (`DEFAULT_RELAYS`, `isTrustedInviteRelay`); for any other relay ask first (`common.relayInvite.confirmTitle`, the deep link's wording), and nothing reaches it before a yes (`enterInviteRelay`: add to the rail, then switch). Once per stored invite: the answer is kept as `steer: 'offered' \| 'declined'`, so a reload neither asks nor switches again; opening the link again clears it. A logged-in person is steered only by the chat shell's `?relay=` gate, so two dialogs never race |
| A key, if none | The login screen (`LoggedOutScreen` / `LoginScreen`) | No key is made for the visitor. Logged out with a stored invite, they get the login as anyone does, in its create-first layout: "Create a new account" (the key file saved before Continue), or an existing key. The redeem row below then lets in whatever key they end up with. (Until 2026-10-29 a fresh invite made a key silently, `loginWithFreshKey`; people never saw the login, saved no key and got no profile step.) |
| Redeem | `useRelayInviteRedeemer` → `redeemInvite` (`services/relay/relay-invite.ts`) | For every pubkey and relay change, if this pubkey is not in `redeemed`: sign a NIP-43 kind 28934 `["claim", code]` (`KIND_RELAY_INVITE_CLAIM`) and publish it through the page hub to the invite relay only, `authMode: 'never'` (the signature is the proof), with an 8 s ack wait |
| Retry | same | A `restricted: invite stale` refusal or no answer (timeout, unreachable, an ack-less `ok`) is tried once more after 1.5 s (`RELAY_INVITE_RETRY_DELAY_MS`) with a freshly signed claim (new `created_at`). Other refusals are not retried |
| Admitted | same | `OK true`: add the pubkey to `redeemed`, then `switchRelay(relay)` to re-enter it, so the access verdict and every refused REQ start over |
| Refused | same | `restricted: invite unknown\|revoked\|expired\|exhausted\|inactive`: drop the stored invite and toast `common.relayInvite.dead.<reason>`. Still not let in after the retry, or the signer failed: keep it, toast `common.relayInvite.redeemFailed`, and try again on the next pubkey or relay change |

**Key rotation.** The stored invite survives logout (it is outside the session
record, and `resetAllClientState` does not touch it). Whatever key the person
logs in with or creates next is redeemed with the same code. Each distinct
pubkey costs the code one use; the same pubkey again costs nothing. Old keys
keep their access.

**After logout, no automatic key.** A key is made silently only while the
invite has not let any key in. Once it has, a logged-out person sees the
login screen as usual, so they can import their own key.

## Invite people (minters)

Who may create links is the relay's decision (`GET /api/invites/me`,
`basis`):

- **The owner, the admins and the reference accounts** of the relay get an
  automatic allowance of **10 people in total**, ever, split across as many
  links as they like. Each new link is clamped to what is left, at most 10
  people and 30 days. Admins are bound by it in the app too; unlimited codes
  are made only in the relay console.
- **Anyone an admin granted an allowance** (`basis: 'grant'`), with the
  grant's limits. A grant replaces the automatic allowance.
- Everyone else cannot invite. A relay from before `basis` existed is read
  as `admin` for an admin and `grant` for anyone else allowed to mint
  (`inviteMeFromJson`).

The API (`services/relay/relay-invite-api.ts`): every request carries a
NIP-98 header, a kind 27235 signed through `nostrActions.signEventTemplate`
whose `u` tag is that request's full URL on that relay. `fetchInviteStatus`
remembers answers per relay and account for the visit (a status, or `null`
for a relay that answers 404/405/501, which has no invite API); a failed
request (network, timeout after 10 s, other HTTP errors) is never
remembered, so the next look asks again. With an extension or a bunker each
signature can be a prompt, which is why answers are shared.

- **The settings entry** (`useCanInvite`, `hooks/settings/invite/`): shown
  when, on the relay in view or another relay in the person's list, the
  account has a `basis` or has made links (a spent allowance still leaves the
  links and who joined). The relay in view is always asked; the others only
  when signing is silent (`loginMethod === 'nsec'`), otherwise they count
  once the panel's picker has asked them. Desktop: the User group of the
  settings nav (`UserSettingsModal`); phone: the first section of the
  preferences screen.
- **The panel** (`components/settings/invite/RelayInviteSettings.tsx`,
  `useRelayInviteSettings`). Settings are global, so it starts with a relay
  picker (`RelayInviteRelayPicker`: the relay in view first, then the rest of
  the person's list, by NIP-11 name and host). Picking one loads that relay's
  `/me` and codes; it never changes the relay in view. A failed load shows
  Retry. Then: "Invited by" when the account came in on someone's link
  (`invited_by`); who can invite here and why, with the allowance as a meter
  ("7 of 10 left", `RelayInviteAllowance`); the create form
  (`RelayInviteCreateForm`, spec `services/relay/relay-invite-form.ts`:
  optional label only the creator sees, how many people, 1 to what is left,
  all of it by default, and days, 7 by default, up to the grant's
  `max_ttl_secs` or 30); the new link shown on its own with Copy and Share
  (`navigator.share` where there is one; both only answer a click); active
  links, then "Past links" (expired, used up, turned off) folded. Each card
  (`RelayInviteCodeCard`): label, link, Copy, Share, uses ("3 of 5 people
  joined"), expiry, who joined (picture, name, short npub, date; someone the
  operator later removed, `evicted_at`, is marked removed), and **Turn off**
  behind an inline confirmation. Turning a link off stops new joins; only the
  relay operator can remove people who already joined.
- **The phone relay menu** (`useRelayMenuSheet`): where this account may
  create links on that relay (`useCanMintOn`, asked only when signing is
  silent, else a remembered answer), "Invite people…" opens the panel on that
  relay (`openSettings('invites', { relay })`). Elsewhere the row reads
  "Share relay link" and copies the bare relay link, as before.

## Storage

| Key | Holds | Cleared |
|---|---|---|
| `obelisk-dex/relay-invite` | `{code, relay, redeemed[], steer?}` | When the relay calls the code dead, or a new link replaces it. Not on logout, on purpose. Listed in the local-data inventory (`login`) |

## Tests

`tests/utils/relay/relay-invite.test.ts` (code cleaning, claim, refusal
parsing, retry and trust rules, URLs), `tests/utils/relay/relay-invite-panel.test.ts`
(reading `/me`, entry visibility, picker order, allowance, form limits),
`tests/services/relay/relay-invite-storage.test.ts` (fresh invite, rotation,
logout rule, `steer`), `tests/services/relay/relay-invite.test.ts` (claim
goes to one relay without AUTH; OK, dead, unclear answers and the one retry;
steering: silent for known relays, asked first for unknown ones, once per
invite), `tests/hooks/relay/invite/useRelayInviteRedeemer.test.tsx` (the
same rule through the hook; a logged-in person is left to the deep-link
gate), `tests/services/relay/relay-invite-api.test.ts` (NIP-98 header per URL
and method, answers remembered, failures not),
`tests/hooks/settings/invite/useCanInvite.test.tsx` (spent allowance, links
only, other relays, prompting signers),
`tests/components/settings/invite/RelayInviteSettings.test.tsx` (relay
picker switching, explanation, past links, Retry) and `RelayInviteCodeCard.test.tsx`,
`tests/hooks/shell/mobile/sheets/relay/useRelayMenuSheet.test.tsx` (the
menu opens the panel on its relay).

## For nostr-wot-sdk

Proposed upstream as [nostr-wot/nostr-wot-sdk#26](https://github.com/nostr-wot/nostr-wot-sdk/issues/26).

The redeem-on-every-identity-change step is the same in every client and
only needs the hub and the signer. obelisk-relay's doc §7 proposes it as
`redeemRelayInvite` in `@nostr-wot/relay` and a `pendingRelayInvite` replayed
by the `@nostr-wot/ui` session, which would let `useRelayInviteRedeemer` shrink
to a configuration line.
