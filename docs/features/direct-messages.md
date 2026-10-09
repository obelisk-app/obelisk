# Direct Messages

Private 1:1 chat between Nostr identities. Like everything else in Obelisk, DMs are entirely client-driven over relays: there is no server in the data path.

> **This document was rewritten on 2026-08-17.** The version before it described a local `src/services/chat/dm/` subsystem that commit `5cbcec0` deleted on 2026-05-10, listing modules (`dm.ts`, `dm-cache.ts`, `cache-key.ts`, `coalescer.ts`, `pool.ts`, a `components/dm/` folder, `feature-flags.ts`) that no longer exist. That staleness cost a full spec-and-plan cycle on the post-quantum work, which was written against a system that was not there. If you change how DMs work, change this file in the same commit.

## Where the code actually is

DMs live **in the bridge**, delegating the wire format to `@nostr-wot/dm`. There is no separate DM subsystem.

| Path | Responsibility |
|---|---|
| `src/services/nostr-bridge/dm/` | The DM modules, wired by `compose-dm.ts`: `send.ts` (optimistic placeholder, per-thread protocol choice, retry), `nip17.ts` (seal and gift-wrap to the recipient's inbox and to ourselves), `nip04.ts` (the opt-out path), `inbox.ts` (the kind 4 and kind 1059 REQs, the `'dm'` AUTH lease), `thread.ts` (dedupe and placeholder replacement into a thread, the bell card), `relays.ts` and `relay-cache.ts` (NIP-65 and kind-10050 lookups, the gift-wrap ladder), `inbox-list.ts` (publishing our own kind 10050), `calls.ts` (DM call control messages), and the encrypted store (below): `store.ts` (locked / unlocked, what is held, what is kept), `store-key.ts` (the DM key wrapped by the signer), `store-db.ts` (the IndexedDB layout), `store-record.ts` (what one stored message holds) |
| `src/lib/crypto/record-cipher.ts` | AES-256-GCM boxes under a non-extractable key held in memory. |
| `src/components/chat/dm/unlock/DmUnlock.tsx`, `src/hooks/chat/dm/unlock/useDmUnlock.ts` | Opening a thread unlocks that peer. The list offers explicit discovery and shows progress while the signer or envelope processing is pending. |
| `src/services/nostr-bridge/session/dm-signer.ts` | The signer the DM transport uses, adapted from the session's login method. |
| `src/services/nostr-bridge/dm/types.ts` | `JsDirectMessage`: the only DM shape the UI ever sees (re-exported from `types.ts`). |
| `src/services/nostr-bridge/hooks/messages.ts` | `useDirectMessages()` over the bridge's `dmsByPeer` store, exported from the front door. |
| `src/services/chat/dm/opt-in.ts` | The `directMessagesEnabled` preference gate. Conversation indexing and encrypted-attachment adapters share that folder. |
| `src/store/chat/dm.ts` | Zustand UI state: `activeDMPubkey`, `isDMMode`, and the persisted per-peer `protocolOverrides` and conversation timestamps (no message bodies). |
| `src/services/chat/pq/` | Post-quantum: attestation lookup, own-capability detection, status computation, send-plan resolution. |
| `src/app/[locale]/app/dm/DmList.tsx`, `ComposeDm.tsx`, `DmOptInGate.tsx` (and `DmOptInBoundary.tsx`), their parts beside them, logic in `src/hooks/shell/dm/` and `src/utils/shell/desktop/` (`dm-list.ts`, `compose-dm.ts`) | Shared DM UI. |
| `src/app/[locale]/app/panes/dm/DmPanel.tsx` | Desktop thread view. |
| `src/app/[locale]/app/mobile/screens/dm/DmThreadScreen.tsx` | Mobile thread view. |
| `src/components/chat/pq/PqMessageMark.tsx`, `src/hooks/chat/pq/usePqConversationStatus.ts` | Post-quantum indicator and the thread's PQ status. |
| `src/components/chat/dm/composer/DmComposer.tsx` (its parts beside it, logic in `src/hooks/chat/dm/composer/`) | The thread's message bar: the channel bar's widgets (attach, voice note, emoji / GIF / sticker picker, drop, paste) with encrypted uploads. Both shells mount it with `key={peer}`. |
| `src/components/chat/dm/message/DmMessageBody.tsx`, `EncryptedDmAttachment.tsx` | What goes inside a bubble; the fetch → verify → decrypt path for file messages. |
| `src/utils/attachments/dm-file.ts`, `src/services/chat/dm/dm-attachments.ts`, `@nostr-wot/dm` | Kind-15 tag layout, encrypt + anonymous upload, AES-256-GCM. |

`@nostr-wot/dm` types never leave `src/services/nostr-bridge/`. That boundary is deliberate: if the SDK integration turns out wrong, the blast radius is the bridge's DM methods rather than every component.

## Protocols

- **NIP-17 gift wrap is the default.** A kind-14 rumor is sealed (kind 13, signed by you, NIP-44 encrypted to the recipient) and then wrapped (kind 1059, signed by a fresh ephemeral key per message, timestamps fuzzed up to two days into the past). Relays see an ephemeral author and a recipient tag, and nothing else.
- **NIP-04 (kind 4) is a per-thread opt-out**, not a fallback that happens on its own. `resolveDmProtocol` returns `'nip04'` only when the user set `useDMStore.protocolOverrides[peer]` to it. The override persists per account.
- **Post-quantum is an optional third layer inside NIP-17**, described below. It is never a separate protocol and never changes anything outside the seal.

Both inbound paths are live: kind-4 events and kind-1059 wraps ingest into the same `dmsByPeer` store, and each message records which one carried it.

Rumor kinds the bridge reads out of a wrap: **14** (chat), **15** (file message, below) and **25055** (call control, never enters `dmsByPeer`; see [docs/features/voice/dm-calls.md](voice/dm-calls.md)).

The wrap ledger (`wrap-ledger.ts`, scope `dm:inert`) remembers only wraps that **never produce a thread entry** (call signals, kinds we don't read, file messages we can't decrypt), so they aren't re-opened on the next load. **Chat wraps are never recorded there**: the encrypted store (below) is what remembers them, through its own index, so removing either one can never hide a message. (The retired `dm` scope recorded chat wraps in the ledger while the messages lived in memory only, and from 2026-08-22 to 2026-09-26 every already-opened NIP-17 message was missing after a page reload; stored ledgers still carry its bit, which nothing reads.) A new rumor kind must still ship its receive path with its send path: an older build files it as inert and won't open it again.

Until 2026-10-06 the reload path (`session/restore.ts`) never pointed the ledger at the account, so after a reload it remembered nothing and every inert wrap was opened again; it now does, as `finalizeLogin` always did.

## Files, voice notes, stickers

The DM bar is the channel bar (`DmComposer`), with one change: **every file and voice note is encrypted in the browser before it leaves**, and sent as a NIP-17 **kind-15 file message** rather than a URL in the text.

1. `checkDmAttachment`: the channel's mime allowlist and size caps (`src/utils/attachments/attachments.ts`), on the base type (`MediaRecorder` reports `audio/webm;codecs=opus`).
2. `encryptFile`: AES-256-GCM, fresh random key and 12-byte nonce per file.
3. The SDK’s `uploadEncryptedBlob`, called through the app’s media adapter: the **ciphertext** goes to Blossom as `application/octet-stream`, with a BUD-11 authorization signed by a **throwaway key minted per upload** and bound to each server with a `server` tag. The server learns the blob's size and hash, not who stored it or what it is.
4. `sendDirectFile`: a kind-15 rumor whose content is the blob URL and whose tags carry `file-type`, `encryption-algorithm: aes-gcm`, `decryption-key`, `decryption-nonce` (hex), `x` (SHA-256 of the ciphertext), `ox`, `size`, `dim`, plus Obelisk's `name` and, for a voice note, `duration`. Sealed, wrapped and routed exactly like a kind 14, including the self-copy and the post-quantum seal.

On receipt `parseDmFileRumor` drops anything we could not decrypt (another algorithm, a non-http URL, a missing key). `EncryptedDmAttachment` fetches the blob, checks `x`, decrypts in memory and shows it from an object URL that is revoked on unmount (images, video and voice notes on mount, other files only on click). Nothing decrypted is written to disk.

Stickers, GIFs and custom emoji are references to public pack URLs, as in a channel; their NIP-30 `emoji` / Obelisk `sticker` tags ride inside the rumor. On a NIP-04 thread the tags are dropped (a kind 4's tags are in the clear) and attach / voice are hidden: NIP-04 has no file message, and `sendDirectFile` refuses one.

Each bubble has a ⋯ (`DmMessageMenu`): copy text / file link / message id / sender npub, and **View raw event**, which shows both layers kept in memory on `JsDirectMessage.raw`: the decrypted rumor (kind 14/15) and what the relay stores (the kind-1059 wrap; for NIP-04, the kind-4 event plus its decrypted text). A file rumor's raw JSON carries its decryption key, and the dialog says so.

Bubbles render through `DmMessageBody`, not `MessageContent`: no link unfurls (that would hand our own `/api/link-preview` every URL two people send each other), and text keeps the bubble's colour.

**What this does not hide.** The ciphertext URL is public by possession and cannot be revoked; anyone holding the URL *and* the rumor can decrypt. The blob's size is visible to the Blossom server, and fetching it reveals the reader's IP to that server, as any image does.

## Opt-in

DMs are off by default (`directMessagesEnabled`, `src/services/preferences/preferences.ts`). While off, the bridge opens no DM subscriptions and publishes no kind-10050. `DmOptInGate` renders the enable prompt; `setDmOptInEnabled(false)` calls `bridge.disableDirectMessages()` to tear the subscriptions down.

## Subscriptions

DMs are the **one** thing in Obelisk that runs cross-relay. Everything group-related binds to the active relay (see AGENTS.md's single-relay rule).

`subscribe()` in `dm/inbox.ts` (once DMs are opted in) opens three filters on the active relay, and the same on our own DM relays:

| Filter | Handler |
|---|---|
| `{ kinds: [4], '#p': [me] }` | `ingestNip04` |
| `{ kinds: [4], authors: [me] }` | `ingestNip04` (our own sends, echoed) |
| `{ kinds: [1059], '#p': [me] }` | `ingestGiftWrap` (`dm/inbox.ts`) |

Then `fetchMyDmRelays()` resolves our own kind-10050 (NIP-17 inbox) and kind-10002 (NIP-65 read/write) sets and duplicates all three filters onto any relay not already covered. Without this, DMs sent by clients that respect our published inbox would never arrive.

A relay switch or a pool reset closes these REQs along with the old sockets. `connect()` reopens them itself when anything has asked for DMs this page-load (`dmWanted`), rather than waiting for a component to remount: a call invite is worth nothing a minute late.

There is no "gift wraps authored by me" filter, and there cannot be: the wrap is signed by a fresh ephemeral key, not by us. That is why every NIP-17 send publishes a **second wrap addressed to ourselves** (below). The `{ kinds: [1059], '#p': [me] }` filter picks it up like any other inbound wrap, which is how the sender's own outgoing history survives a reload and reaches their other devices.

## Sending

`sendDirectMessage` inserts an optimistic placeholder and hands off to `publishDirectMessage`, which never blocks on anything optional.

**NIP-04 path:** encrypt, publish to `this.relays` plus the recipient's NIP-65 read relays.

**NIP-17 path:**

1. `buildChatMessage(me, peer, content)` builds the kind-14 rumor, with its `created_at` pinned to the timestamp the optimistic placeholder already committed to.
2. `resolvePqSend` decides whether the seal can be post-quantum (below).
3. `sealAndGiftWrap` produces the kind-1059, post-quantum or classic.
4. `resolveGiftWrapRelays` decides where the wrap goes; see [Inbox routing](#inbox-routing-kind-10050).
5. Publish, then replace the placeholder.
6. `publishSelfGiftWrapCopy` seals the **same rumor** a second time, addressed to us, and publishes it to our own inbox only.

The placeholder is replaced with the **rumor's id**, not the wrap's. A gift wrap's id belongs to its ephemeral envelope and differs between the two copies, so keying the thread on it would let our own self-copy render as a second message. The rumor id is identical in both wraps and on every device, which is what `ingestDM` dedupes on. Timestamps use **our own pre-fuzz `created_at`**, not the wrap's: NIP-17 fuzzes the wrap timestamp backwards for privacy, so using it would make a message you just sent appear days old.

Failures mark the placeholder failed and surface a retry button; `retryDirectMessage` replays the same arguments, including the resolved protocol.

### The self-copy

NIP-17 delivers a sender-addressed copy alongside the recipient's. Three rules govern it:

- **Same rumor object.** Rebuilding it would produce a different timestamp and a different id, and the copy would come back off the relay as a second message.
- **Its own fresh ephemeral key.** `sealAndGiftWrap` generates one per call. Reusing one would let any relay link the two copies and undo the metadata protection NIP-17 exists to provide.
- **It never fails the send.** The recipient's copy is the message; losing ours degrades history only. Every failure is swallowed and logged through the relay-debug channel, and the publish is `quiet` so the user does not see a second "Publishing" entry for one message.

When the delivered copy went out post-quantum, the self-copy is sealed post-quantum too, encapsulated to **our own** ML-KEM key (`PqSendPlan.selfKemKey`), not the recipient's. Using the recipient's would need their ML-KEM secret to open, so we would have published a copy of our own message that we could never read again. When the delivered copy was classic, the self-copy stays classic: sealing ours post-quantum would make the message read as protected after a reload when it never was.

NIP-04 threads publish no self-copy and need none. Those events are authored by us, so the `{ kinds: [4], authors: [me] }` filter already finds them.

## Inbox routing (kind 10050)

### Where a wrap goes

> Full reasoning, the threat model, what this cannot fix, and the rules for
> anyone changing DM routing: **[docs/features/dm-metadata-privacy.md](dm-metadata-privacy.md)**.
> Read it before adding a relay to any publish target.

Relay selection is a privacy control, not a delivery convenience. A kind-1059 is signed by a throwaway key so a relay learns only "some ephemeral key dropped a wrap for someone". Publishing that wrap to the relay the user is browsing destroys the guarantee: that socket is NIP-42-authenticated as the real sender, so the relay gets the true identity, the true send time, and (if the recipient reads there too) the sender-to-recipient edge.

`resolveGiftWrapRelays` therefore walks a strictly ordered ladder and uses each rung **alone**, never unioned:

| Rung | Target | Why |
|---|---|---|
| 1 | Recipient's kind-10050 inbox | The answer NIP-17 defines. Nothing of ours is added. |
| 2 | Recipient's NIP-65 read relays | Still relays *they* chose, so the wrap stays on the recipient's infrastructure. |
| 3 | Our active relay | Last resort, and the only rung with a real cost: this relay sees an authenticated publish from us. Taken anyway, because the spec forbids letting a missing inbox list block a send. |

The self-copy goes to **our own inbox only**: the relays `subscribeIncomingDMs` already holds authenticated REQs on (`this.relays` ∪ `myDmRelays`). It never rides along to the recipient's relays, and any relay that just took the recipient's copy is subtracted from its target set so no single relay can pair the two same-sized wraps. If that subtraction would empty the set (both parties on one relay), durability wins and it is logged as `dm-self-copy-shares-relay`.

Gift-wrap publishes use `authMode: 'last-resort'`: no NIP-42 identity is volunteered up front, since AUTH would staple our real pubkey to an envelope built not to carry it. Only if *every* target refused, and at least one refusal was auth-shaped, do we re-publish authenticated rather than drop the message.

### Publishing our own list

On login, `ensureDmInboxRelaysPublished` publishes our own kind-10050 advertising `this.relays`, unless a current one already exists. It republishes when the advertised set no longer matches or the existing event is older than seven days. Gated on the DM opt-in, and best-effort: a failure degrades reachability without breaking anything.

It targets the **NIP-65 read+write union** (AGENTS.md's relay scope for DM traffic) plus the active relay plus whatever the previous list named, so a replacement actually supersedes the copy senders will read. The union is derived from the same REQ that checks for an existing list (`kinds: [10002, 10050]`), so there is no extra round-trip. When the user has no NIP-65 list at all the union collapses to the active relay and nobody could find the list, so the profile relays are added back.

The publish uses `authMode: 'never'`. A kind-10050 is public by design and self-signed; no relay needs to know who opened the socket in order to store it, and authenticating the user to relays they never selected is not a price worth paying for discoverability. The active relay is already authenticated from ordinary browsing, so the list always lands somewhere.

Without a published kind-10050, no NIP-17 client can reach you, however many wraps other people send.

## Post-quantum

The post-quantum envelope replaces the **seal's** ciphertext. Everything outside the seal is unchanged, so a relay or a client that has not implemented it still sees an ordinary kind-1059. `@nostr-wot/pq` owns the envelope; `@nostr-wot/dm` passes an opts bag through to the signer; the signer owns the key material. Obelisk holds no post-quantum secrets and cannot derive any: its logins are `nsec | nip07 | bunker` and it never sees a BIP-39 seed.

**Sending.** `resolvePqSend` (`src/services/chat/pq/send.ts`) returns the peer's ML-KEM key plus our own (for the self-copy), or `null` meaning "send classic". All three of these must hold:

1. The `postQuantumEnabled` preference is on.
2. `selfPqState().canSend`: the extension advertises `window.nostr.nip44.schemes` including `'pq'`.
3. The peer publishes a usable `kind:10203` attestation carrying a KEM key.

Condition 2 requires the **explicit marker**, not merely a NIP-07 session with published keys (`capabilityUnknown`). Post-quantum is an optional third argument to `nip44.encrypt`; an unaware extension silently ignores it and returns classic ciphertext, which we would then record as protected. A false claim of protection is worse than an honest classic send, so unknown means classic. No shipping extension advertises the marker yet, so in practice post-quantum sending is reachable only against a signer that opts in.

`resolvePqSend` never throws, and a signer that refuses post-quantum after advertising it falls back to a classic seal. **A message that cannot be protected still sends.** That rule is in the spec and is non-negotiable.

Condition 2 is checked **locally first**, before any relay round trip, because it is free (`loginMethod === 'nip07'` plus the `window.nostr.nip44.schemes` marker) and settles the answer for every session that cannot send post-quantum anyway. Without that short circuit, every DM send on every session would pay two attestation lookups to learn nothing, which matters now that the preference defaults on.

**Receiving** needs no configuration: the envelope is self-describing, so `signer.nip44Decrypt` routes on its own.

**Provenance.** Every message carries `protocol: 'nip04' | 'nip17'` and `pq?: boolean`. Inbound `pq` comes from `isPqEnvelope()` on the seal's ciphertext, recorded by the signer adapter's `pqTrack` because `unwrapGiftWrap` does not report its own routing decision. Outbound `pq` reflects what the seal actually did, never what was requested. `undefined` reads as classic everywhere, which is what any message stored before the field existed should mean.

**Indicators.** Standard NIP-17 carries no badge. NIP-04 shows “Legacy” with a tooltip explaining that the content is encrypted but sender, recipient and timestamp remain visible to relays. Post-quantum messages show a shield with an explanatory tooltip. Marks are aggregated at protocol transitions. Tooltips also open on focus or tap. The thread header shows the same quiet choices based on the configured next-send capability, while message marks reflect actual message provenance.

## Who the thread says you are talking to

DM surfaces resolve the peer's name and picture through **`useAuthor`**
(`src/hooks/social/profile/useAuthor.ts`), never the bridge's `useUserMetadata`
directly.

The bridge queries only `DEFAULT_PROFILE_LOOKUP_RELAYS` (lacrypta,
public.obelisk.ar, purplepag.es), which hold kind 0 for people in your NIP-29
rooms. A DM peer is usually someone from the wider network with no reason to
have published there, and `public.obelisk.ar` is whitelist-gated so it
answers for nobody else at all. The lookup always fired; it just asked relays
that could not know. Every DM row, thread header and compose row therefore
rendered a petname and a letter avatar, while the *same person* resolved
fine in the feed, which had hit this first and grown `useAuthor` to merge
the group tier with the social one.

Two rules for this surface:

- **Lists batch.** Call `ensureSocialProfiles(allPeers)` once in an effect;
  `useSocialProfile` fires per hook otherwise, so thirty conversations is
  thirty round trips. Both DM lists do this.
- **Tests must mock it.** `vi.mock('@/hooks/social/useAuthor', …)`; the real
  hook opens sockets to public relays from jsdom.

The privacy cost is real and worth stating: opening a DM now asks the social
relays for that peer's kind 0, which tells those relays somebody is
interested in that pubkey. It is an unauthenticated REQ, batched with
unrelated lookups, and it is the same exposure the feed has always had, but
it is new for DMs. See [dm-metadata-privacy.md](dm-metadata-privacy.md); if
that trade ever stops being acceptable, the lever is to resolve DM peers from
cache only and accept the petname fallback.

## The thread header

The header separates protocol information from thread actions:

- **`PqShield`**: optional Legacy label or post-quantum icon; normal NIP-17 has no badge.
- **`PqMessageMark`**: actual message provenance, aggregated at protocol transitions.
- **`DmThreadMenu`**: profile, copy npub, mute and block actions.

## Security

`unwrapGiftWrap` verifies the seal's signature and rejects a rumor whose `pubkey` differs from the seal's signer. Both failures raise the same generic error so neither becomes an oracle. Authentication does not rest on the NIP-44 conversation-key binding alone.

The bridge treats `senderPubkey` (recovered from the seal) as the author and never trusts the rumor's own `pubkey` field.

An outgoing wrap that arrives from another device carries the real recipient in the rumor's `p` tag; an inbound one is from the sender directly. `ingestGiftWrap` (`dm/inbox.ts`) distinguishes them the same way `@nostr-wot/dm`'s own `handleGiftWrap` does.

## Storage: the encrypted DM store

The owner's decision (2026-10-06): DMs are kept on the device encrypted with AES-256, opened once per visit with the signer, and kept decrypted in memory only from the moment the person asks for them.

**What is kept.** Every DM the app opens (received, our own sends, NIP-04 and NIP-17, file messages with their decryption metadata, the rumor tags, and the raw rumor and wire event for "View raw event") is saved as one AES-256-GCM box in IndexedDB, database `obelisk-dms`, store `records`, key `dm:<pubkey>:<wire id>`. Each box has a fresh 12-byte IV and is bound to its account and wire id as additional data (`store-record.ts`), so a box moved to another slot or account does not open. DMs have no reactions in Obelisk, so there are none to keep. Our own sends are kept when they settle: a NIP-04 under its event id, a NIP-17 under its self-copy's wrap id (the one that comes back to us), so the echo is never decrypted again.

**The key.** One random 32-byte key per account. It is stored only wrapped, under `key:<pubkey>` in the same database, as a NIP-78 app-data event (kind 30078, `d` = `obelisk:dm-key:v1`) whose content is the key NIP-44 encrypted to the user's own pubkey through the session signer (`store-key.ts`). The event is **not signed and not published**: signing would cost a second prompt and adds nothing (NIP-44 to oneself is authenticated with a conversation key only the user's signer can derive), and publishing would tell relays this pubkey uses Obelisk without helping another device, which has no copy of the boxes. Once unwrapped, the bytes are imported as a non-extractable `CryptoKey` (`src/lib/crypto/record-cipher.ts`), the byte copy is zeroed, the decrypt memo's entry for it is dropped, and the key lives in the bridge's memory only. It is dropped on logout and on account switch, and dies with the page.

**Locked until asked.** A page load decrypts nothing DM-related and asks the signer nothing (`store.ts`):

- Kind 4 events and gift wraps that arrive are held in memory as they came off the relay (ciphertext; at most `MAX_HELD`, oldest dropped, since the relays send them again).
- The read-state sync waits too: while DMs are on and locked it opens no gift wrap it has not classified (`sync-ingest.ts`), and it never opens one the store holds (that wrap is a DM, and it records the verdict).
- `DmUnlock` opens only a selected thread automatically. Lists and compose screens offer **Discover encrypted chats**, which calls `unlockDirectMessages()` without a peer. Unlocking the store uses one signer call: `nip44Decrypt` of the wrapped key, or first-time `nip44Encrypt` of a new one. Stored boxes open locally; newly received encrypted messages may need additional signer calls. Selecting a thread releases only that peer's cached history and NIP-04 events; discovery releases unidentified gift wraps and remains enabled for this visit. A refusal leaves the DMs locked (`failed`) with a retry, never another automatic prompt.
- A wrapped key that the signer opens into something that is not a key is treated as lost: the account's boxes are deleted and a new key is made (the messages come back from the relays).

**What the store skips.** A wrap or kind 4 whose message is stored is never sent to the signer again. The store's index (its record keys) is the authority, not the localStorage ledger. A box that does not open (tampered, or under a lost key) is deleted, so its wire id is unknown again and the relay's copy is opened and saved afresh.

**The bell.** A DM card (`obelisk-notifications:{myPubkey}`) is saved as wire id, sender and time; its `preview` is memory only (`partialize` drops it; saved-data version 2 erased the text older versions wrote). While locked, a card says "New direct message" with its sender. A kind 4 that arrives while locked raises such a card at once (its sender is on the wire); a gift wrap's sender is inside the encryption, so the held wraps the store does not hold and that are newer than the DM cursor are counted in one "N new direct messages" row that opens the DMs. On unlock each card gets its text from the decrypted message (`fillDmPreview`), without a second chime.

**What stays in the clear on disk.** The wire ids (public relay event ids, already in the ledger) and so the number of stored messages; the DM card's sender and time while it is uncleared; the per-peer DM read cursors (the read-state cache), so who you DM with. Not the text, not the file keys, not the rumor.

**What this protects against.** A copied browser profile, a backup, malware or a person that reads the disk without the user's signer: they find ciphertext and a key wrapped to the user's Nostr key. **What it does not.** Code running inside the page once DMs are open (it can read memory, or ask the signer as the app does); someone with the user's nsec or an unlocked signer; the relays' own copies, which are as before.

**Lifecycle.** Logout deletes the account's key and boxes. Settings > Data on this device lists "Direct messages (encrypted)" as its own category with its size and a Remove (the bridge stops writing and drops the key, the database is deleted, the page reloads, and the DMs are fetched and decrypted from the relays again, one signer round trip per wrap as before). Remove everything deletes the database with the vault. Removing the login deletes only the vault: the logout it runs deletes the current account's DM store. Two accounts on one browser have separate keys and slots, and neither can open the other's boxes. Without IndexedDB (some private windows, storage off) unlocking needs no key, DMs work for the visit in memory only and nothing is written.

**Consequence: DM calls.** An incoming DM call invite is a gift wrap too, so it does not ring until the DMs are opened in that tab.

The only other persisted DM state is `obelisk-dm-store:{myPubkey}` (a localStorage key despite the name), holding the per-peer protocol overrides. Its `merge` explicitly discards `threads` / `messages` so a legacy PWA install that still has them on disk never merges them back into memory. Read cursors live in `obelisk-read-state:{myPubkey}` (see [docs/architecture/read-state.md](../architecture/read-state.md)). Kind 4 and kind 1059 stay excluded from `bridgeCache` (see [docs/architecture/data-system.md §9](../architecture/data-system.md)).

`dmsByPeer` deliberately survives a relay switch: DMs follow the user, not the relay. It is cleared on logout and account switch.

## Notifications

Incoming DMs push a card onto the DM notification stream (`useNotificationsStore.pushDmNotification`) unless the user is actively watching that thread (`isUserWatchingDM`). Relay-agnostic on purpose, because DMs are the cross-relay stream. Group mentions are a separate stream with a separate cursor. While the DMs are locked a card has no text (see Storage above).

## Operational notes

- **Self-hosted instances** need no configuration. There is no DM-related env var, migration, or admin setting.
- **Bunker users** get one signer round trip per send (the seal encrypt plus the seal signature) and one per inbound wrap that is not already in the encrypted store, plus one per visit to open the store. Bunker sessions cannot send post-quantum: NIP-46's `nip44_encrypt` request has no field for `recipientKemKey`, and `Nip46Signer` throws rather than silently downgrading.
- **nsec sessions** cannot send post-quantum either. Obelisk never sees a BIP-39 seed, so there is nothing to derive ML-KEM keys from, and `@nostr-wot/pq` rejects a 32-byte secp256k1 key as seed input because that derivation would be circular.

## Troubleshooting

- **"Sent a message but they never got it."** Check whether the recipient has published a kind-10050. Without one the wrap falls to their NIP-65 read set, and without that to our own active relay, neither of which is guaranteed to overlap with what they actually read. They can fix it once, for everyone, with any modern client.
- **"Older NIP-17 messages vanish after a reload, only new ones show."** That was the wrap ledger recording chat wraps as seen (fixed 2026-09-26, see Protocols). If it comes back, check what `hasSeenWrap` is being asked in `ingestGiftWrap` (`dm/inbox.ts`).
- **"My DMs are empty after a reload."** Known chats are listed without plaintext; open a thread or choose Discover encrypted chats to decrypt. If the signer was asked and said no (or did not answer), the list shows a retry. Settings > Data on this device > Direct messages (encrypted) > Remove starts the store over.
- **"My own DMs are missing after a reload."** A message sent from this device is kept in the encrypted store when it settles. One sent from another device comes back only through its self-copy. If an outgoing NIP-17 message never comes back, its self-copy did not land: check whether we have a published kind-10050 (`ensureDmInboxRelaysPublished`) and whether the relay accepted the second wrap. Messages sent before the self-copy shipped are gone from the sender's side for good; the recipient still has them.
- **"The post-quantum toggle is on but nothing is post-quantum."** Almost certainly `capabilityUnknown`: the extension does not advertise `nip44.schemes`. The settings status row says so explicitly.
- **"Every old message shows a mark."** It should not: marks aggregate to transitions. If you see one per bubble, `threadMarks` is not being used.

## Tests

- `tests/services/nostr-bridge/dm/store.test.ts`, `store-lifecycle.test.ts`: the encrypted store end to end on the fake relay pool with a fake IndexedDB and a counting NIP-07 extension: no message text anywhere on disk after receiving, reading and sending; a reload shows nothing until the unlock, then everything with exactly one signer decrypt and no wrap re-sent to the signer; the bell without and with text; nsec with no extension call; a tampered box re-fetched; no IndexedDB; logout; Remove; two accounts; the ledger after a reload. `store-module.test.ts` (a refusal and the retry, the read-state wait, a lost key), `store-record.test.ts`, `tests/lib/crypto/record-cipher.test.ts`.

- `tests/services/nostr-bridge/dm-nip17.test.ts`: NIP-17 default, inbox routing, forged-authorship rejection, all three login methods.
- `tests/services/nostr-bridge/dm-pq-send.test.ts`: post-quantum send and receive, every negative case, the classic fallback.
- `tests/services/nostr-bridge/optimistic-send.test.ts`: placeholder lifecycle.
- `dm-nip17.test.ts` also covers kind-15 send and receive, the NIP-04 refusal, and the 1059 REQ reopening after `switchRelay`.
- `tests/utils/attachments/dm-file.test.ts`, `tests/services/chat/dm/dm-attachments.test.ts`, `tests/services/media/blossom.test.ts`: the file path end to end, without a relay.
- `tests/components/chat/dm/composer/DmComposer.test.tsx`, `DmMessageBody.test.tsx`, `EncryptedDmAttachment.test.tsx`: the bar, the bubble body, decrypt / integrity failure / revoke.
- `tests/services/chat/pq/` (`attestations`, `capability`, `status`, `send`): attestations, capability, status lattice, send-plan resolution.
- `tests/app/[locale]/app/panes/dm/DmPanel.pq.test.tsx`: indicator mounting, mark aggregation, on-accent contrast.
- `tests/app/[locale]/app/dm/DmList.identity.test.tsx`: the peer resolves through the social tier, and one batched lookup per list.
- `tests/components/chat/dm/thread/DmThreadMenu.test.tsx`: the ⋯ actions, and that they close after acting.

NIP-17 attachment encryption and self-addressed NIP-59 envelope cryptography live in `@nostr-wot/dm`; Obelisk keeps upload choices, signer scheduling, read-state merge rules, and private payload schemas. The remaining `src/lib/crypto` record/session vault code retains the established local `SealedBox` format and IndexedDB lifecycle. It is application persistence compatibility, not another implementation of the SDK vault record format; replacing it requires an explicit persisted-data migration.

### Chat discovery and decryption consent

The desktop and mobile lists show known counterparties before decrypting message bodies. A per-account conversation index retains only peer public keys and latest message timestamps in local storage; protocol preferences remain there too. Message text and previews are never added to that index. Existing notification metadata provides a fallback for older installations. NIP-04 exposes its sender/recipient on the wire, so its chats can be indexed while locked. NIP-17 hides the sender inside the encrypted envelope: previously unseen chats cannot be identified without decryption.

The list offers **Discover encrypted chats** instead of automatically asking the signer on mount. Selecting a known conversation opens its cached messages and held NIP-04 messages; other senders and unidentified NIP-17 wraps stay held until discovery is requested. Discovery opens the envelopes needed to identify those chats and remains enabled for new arrivals for the current page session. A signer configured to always approve completes those requests without prompting; Obelisk does not probe for that external permission. Cached history uses the local encrypted store after its key is unlocked, without a signer request per cached message. Older cached conversations not yet indexed become known on their next discovery.

Unlocking the storage key and opening the queued messages are separate phases. The shared unlock indicator reports pending message decryption until that queue settles, and the desktop list avoids a false empty state during that work. Pending completions from a previous account cannot overwrite the current account's lock state.

### Recovering messages that did not open

A failed NIP-04 decrypt or NIP-17 unwrap stays in the bounded in-memory pending queue and exposes a retry message instead of silently disappearing. Relay duplicates do not retry failed decryptions; the person retries explicitly after their signer is available. Logout clears the queue, and stale decrypt failures cannot enter another account. Successfully opened messages retain the existing encrypted local cache.

The explicit discovery button is also available inside a known conversation when unidentified gift wraps remain. Opening a peer alone cannot identify which unknown NIP-17 envelopes belong to it without decrypting them. Discovery authorizes that operation across the inbox. The relay inbox still initially requests at most 200 events per filter per relay; this recovery does not add older-history pagination.
