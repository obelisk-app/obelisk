# Apps (games and more) — the host side

Games are no longer part of this repo. Chain Reaction, Vesta and Stacker —
and anything else — are **apps**: code published as Nostr events by whoever
can write to the relay, fetched from Blossom, verified by hash, and run in a
sandboxed iframe. This app is only the **host**.

- Wire format, host API, security model, known issues:
  [obelisk-app/obelisk-apps](https://github.com/obelisk-app/obelisk-apps)
  `docs/` (`app-format.md`, `host-api.md`, `security.md`, `known-issues.md`).
- Cross-project sandbox rules:
  obelisk-design `security-workflows/app-sandbox.md`.
- The pre-migration games doc is in git history (`docs/games.md`, until
  2026-09-27).

## Security model (state the boundary first)

**App code is untrusted.** It runs in
`<iframe src="https://frame.obelisk.ar/v1/" sandbox="allow-scripts" allow="" referrerpolicy="no-referrer">`
— an opaque origin that can't touch this app's storage, signer, DOM or
cookies — under the frame's own CSP (`connect-src 'none'`, so no network).
Everything it can do goes through `AppHost` (`src/lib/apps/host.ts`) over a
MessagePort, and **every rule is enforced there**:

| Request | Host rule |
|---|---|
| `publish` | kind 2390 only; `h`, `t`, `op`, `e` set by the host from the session; `op` must match `^[a-z][a-z0-9-]{0,31}$` and is never `create`; `n` is the only extra tag; content ≤ 64 KiB; `status` ≤ 140 chars; token bucket 20 deep / 5 per s |
| `asset` | only the session's pinned paths, each verified by sha256 (`bundle.ts`) |
| `storage.*` | `obelisk-dex/app-storage/{appAddress}/{me}/…`, ≤ 256 KiB |
| `profiles` | only pubkeys that authored an event in the session |
| `ui.toast` | ≤ 120 chars, one per 3 s, prefixed with the app's title |

Never crosses the port: the signer, relay URLs, group ids, avatar URLs.
Avatars go over as Blobs fetched by the host (`people.ts`) through
`/api/avatar` — a stateless server fetch with the link-preview route's SSRF
guards (every redirect hop checked for private addresses, 1 MiB cap, raster
images only, never SVG, nosniff + sandbox CSP, per-IP budget). A browser
fetch failed for most image hosts (no CORS), which left players as initials;
the server fetch also means image hosts see us, not the player.

The frame chrome — title, **"by <author> · third-party app"**, close — is
drawn by `AppFrameModal` outside the frame, and is the main defence against an
app drawing a fake Obelisk screen.

### What this does not defend against

- **Self-navigation.** An app can navigate its own frame to a URL carrying
  data. `AppFrameModal` treats a second `load` as that and tears the frame
  down — after the request has left.
- **WebRTC.** `RTCPeerConnection` isn't covered by the sandbox or CSP; an app
  can reach a STUN/TURN server with data in it. No page-level fix exists.
- **Phishing inside the frame.** Mitigated by the host-drawn chrome only.
- **CPU and battery.** Until the modal is closed. Frames never run hidden in
  the background.
- **Spam** of app ops, up to the rate limit, in sessions the user opened.
- **What can leak** through the two gaps above: the session's events, the
  participants' names and avatars, the user's IP. Never keys or chats.
- **Old versions** stay runnable while sessions pin them; **a vanished blob**
  makes an app unopenable.

## Flow

1. `/play` (games) or `/app` (everything) opens `AppPicker`, listing the
   **active relay's** kind 32390 manifests (`catalog.ts`; single-relay rule —
   the relay's admission rules are the catalog's curation).
2. Picking publishes the session `create` (kind 2390) with the manifest's
   `path` tags and aggregate `x` copied in — **the version pin** — posts
   `[[app:<id>]]` as a kind 9 message, and opens `AppFrameModal`.
3. The frame's loader posts `hello`; the modal checks it came from **its**
   iframe, fetches and verifies `/index.js`, and posts `boot` with the entry
   Blob and a MessagePort. From then on `AppHost` owns the port.
4. The chat card (`AppCard`) is drawn by the host from the manifest and the
   session summary (`summarizeSession`: participants, cancelled, the app's
   `status` line) — never a live board.

The kind 2390 transport, batched ingest, per-relay cache and by-id resolver
are the games ones carried over (`src/lib/apps/{transport,ingest,resolve}.ts`,
`src/store/apps.ts`), now holding raw events keyed by session.

## Legacy tables

Tables created before 2026-09-27 (`["t","obelisk-game"]`, a `game` name, no
pin) map to the official apps (`legacy.ts`) and run the official app's
**current** bundle. Needs `NEXT_PUBLIC_OBELISK_APPS_PUBKEY` (hex) set to the
key that publishes the first-party apps. Kind 2390 is pruned after 7 days;
remove the mapping after that.

## Configuration

| Env | Default | |
|---|---|---|
| `NEXT_PUBLIC_APP_FRAME_URL` | `https://frame.obelisk.ar/v1/` | also feeds `frame-src` in `src/proxy.ts` |
| `NEXT_PUBLIC_OBELISK_APPS_PUBKEY` | — | official apps key, for legacy tables |

The Tauri shell has its own CSP and must allow the same frame origin.
