# obelisk-dex e2e harness

Playwright-driven end-to-end tests that drive a real browser against a
running app, capture every signal the client emits, and assert each
step against the auth/data-loading contract documented in
`docs/auth-and-data-loading.md`.

The harness skips the LoginModal — it seeds an nsec PersistedSession
into `localStorage` before the page loads, so `BridgeImpl.initialize()`
rehydrates as if the user had already logged in. Identity is generated
fresh per run; nothing real ever signs anything.

## Run

Against a local dev server:

```bash
npm run dev          # in another shell
npm run test:e2e     # headless
npm run test:e2e:headed   # watch the browser
```

Against production:

```bash
OBELISK_E2E_BASE_URL=https://obelisk.ar npm run test:e2e
```

Useful overrides:

| Variable | Default | What it does |
|---|---|---|
| `OBELISK_E2E_BASE_URL` | `http://localhost:3001` | Origin under test. |
| `OBELISK_E2E_RELAY` | `wss://public.obelisk.ar` | Relay seeded into the bridge session. |
| `OBELISK_E2E_CHANNEL` | `general` | Channel name to open + post into. Falls back to the first visible channel if not found. |
| `HEADED` | unset | Set to `1` to launch a non-headless browser. |

## What gets logged

Every run streams structured progress to stdout:

```
▸ Generate ephemeral identity + seed session — expected: …
  10:42:15.881 npub  npub1q5…
  10:42:15.882 nsec  nsec1xy…  (ephemeral, do not reuse)
  10:42:15.882 relay wss://public.obelisk.ar
  ✓ session seeded into localStorage via addInitScript

▸ Wait for NIP-42 AUTH + first EOSE — expected: relay-access banner unmounts.
  10:42:16.412 relay-access → unknown
  10:42:16.671 relay-access → authenticating
  10:42:16.870 ← AUTH  public.obelisk.ar  ["challenge-string"]
  10:42:16.918 → AUTH  public.obelisk.ar  [{"id":"…","kind":22242,…}]
  10:42:16.948 ← OK    public.obelisk.ar  ["…",true,""]
  10:42:17.122 ← EOSE  public.obelisk.ar  ["sub-1"]
  10:42:17.221 relay-access → ok
  ✓ relay confirmed read access (banner gone, channelsVisible=true)
```

Captured streams:

- **Browser console** — every `console.log/warn/error` and uncaught
  page error, mirrored with the test step it landed under.
- **WebSocket frames** — every `AUTH`, `CLOSED`, `NOTICE`, `OK`, `EOSE`
  on every relay socket, in either direction. Use this to debug a
  stuck NIP-42 round-trip or a relay sending CLOSED `restricted:` for
  an unrelated channel sub.
- **Relay-access state transitions** — read straight off
  `[data-testid="relay-access-banner"][data-state="…"]`, so the trail
  exactly matches what a user would see in the UI.
- **DOM checkpoints** — sidebar populate, channel selection, message
  paint, post-publish access state.

## Failure artifacts

On failure the harness retains:

- Full trace zip — replay frame-by-frame with
  `npx playwright show-trace scripts/e2e/test-results/<…>/trace.zip`.
- Video recording.
- Screenshot.
- HTML report at `scripts/e2e/playwright-report/` — open with
  `npx playwright show-report scripts/e2e/playwright-report`.

## Adding a new test

1. Drop a `*.spec.ts` next to `login-and-send.spec.ts`.
2. Import the helpers from `./lib`.
3. Always seed the session via `seedSession(context, …)` *before*
   `page.goto` so the bridge rehydrates cleanly.
4. Use `attachClientCapture(page)` to mirror console + websocket
   traffic.
5. Use `waitForRelayOk(page)` rather than `waitForTimeout` — that's
   the contract every read-side feature depends on.

## Notes / gotchas

- The local dev server runs on port `3001` (see `ecosystem.config.js`).
  Override `OBELISK_E2E_BASE_URL` for any other host.
- Posting to `wss://public.obelisk.ar` produces a real, public message
  on a real, public relay. The probe text is timestamped + tagged with
  the test pubkey so it's easy to grep in relay logs.
- `OBELISK_E2E_RELAY` must be a relay your *fresh* test pubkey is
  allowed to read+post on. Whitelist relays will produce a clean,
  expected `auth-required` / `restricted` failure that the harness
  surfaces in the relay-access transition log.
