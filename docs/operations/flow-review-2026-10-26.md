# Flow review, 2026-10-26 (from the recording pass)

Problems found while recording obelisk.ar for the landing page and the guides,
with the throwaway persona "Capitán Mate" (`npub13xl44zwhc2plc40ry8ed82zhskq27j5kn3fnzrawx0vkdgc7nh8q7k4xlk`)
on production, Chromium, 1920×1080 and 412×915 phone emulation, Spanish UI.
Nothing here is fixed yet; each entry says what was seen, where, and a suggested fix.
Severity: **high** blocks a flow, **medium** misleads or breaks a step, **low** is polish.
The recorder's dry-run manifests (`obelisk-media/videos/_captures/recordings/*/dry-*/manifest.json`)
keep the console errors and failed requests of every shot.

## Blocking

- **high: a new account cannot save its first profile while any lookup relay is down.**
  `OwnProfileModule.edit` (`src/services/nostr-bridge/profile/profile-own.ts`) reads the
  newest kind 0 first and, when none is found, throws `profile-load-failed` unless *every*
  relay in `DEFAULT_PROFILE_LOOKUP_RELAYS` (plus the rail) answered. `wss://purplepag.es`
  returned 502 all evening, so the query is never `complete`, and a brand-new account (which
  has no kind 0 anywhere by definition) can never publish one. A relay that is not whitelisting
  the user, or a relay that is down, has the same effect. Suggested fix: count a relay that
  failed to connect or closed the REQ as answered-with-nothing (it cannot hold a newer
  profile we could overwrite), or accept "no event" once a quorum answered; keep the guard
  only for relays that timed out mid-answer.
- **medium: the error it shows is wrong.** The save fails with "No se pudo cargar tu perfil
  actual. Probá de nuevo." on a profile that does not exist yet, and trying again cannot help.
- **medium: `nostr.build` can never take a browser upload.** Its `OPTIONS /upload` preflight
  has no `Access-Control-Allow-Origin`, so every profile upload spends a failed request on it
  (`BLOSSOM_SERVERS`, `src/constants/media/blossom.ts`). `blossom.primal.net` passes the
  preflight but its `PUT` failed with no CORS header on the response (likely an error
  status without CORS headers). Suggested fix: drop `nostr.build` from the browser list, put
  `blossom.band` first, re-measure primal.
- **medium: a non-whitelisted user lands on an empty app with no way forward.** Desktop: a
  modal "No estás en la whitelist de public.obelisk.ar" *and* a toast saying the same thing,
  then an empty sidebar and the empty state "Elegí desde la barra lateral o tocá + para crear
  un canal", which a non-member cannot do. Phone: "Tenés que estar en la whitelist", no
  action. Suggested fix: one notice, and an empty state that says how to get in (ask the
  operator, with the npub ready to copy, or open the public relay list).

## Login and onboarding

- **medium: the login modal is half translated.** On a Spanish UI the title ("Conectate a
  Nostr / Elegí cómo entrar") is Spanish but every method ("Browser extension", "Remote signer
  (bunker)", "Create a new account", "Paste private key", "Get the Nostr WoT extension") and
  the next steps ("Your new key", the backup checkbox, "Continue", "Sign in", the paste
  warning, `nsec1... or 64-char hex`) are English. These come from the `@nostr-wot/ui` login
  widget; it needs Obelisk's strings passed in, or its own es/pt catalogues.
- **low: the "Your new key" copy has em dashes** (between "Private key (nsec)" and "keep
  secret", and before "there's no recovery"), which the repo bans everywhere else.
- **low: the paste-key step renders a checkbox nobody can see.** `input[type=checkbox]` is in
  the DOM, hidden, with no label (likely a "remember me" whose label is not rendered).
- **low: a pasted-key login skips the profile step** the new-account flow shows, so the user
  is left as "Vos" / "Anónimo" with no prompt to name themselves.

## Profile and settings

- **medium: Save and Cancel are cut off at 1080p.** In Settings > Perfil the action row sits
  below the dialog's bottom edge; the button is visible only after scrolling inside the
  dialog. Make the footer sticky (or use `ModalFooter`).
- **low: three different avatar fallbacks for one account.** Sidebar "89", settings header
  "8", profile editor "0". One fallback (the identicon or the first letter of the name).
  "89" and "8" are hex digits of the pubkey, close to the "keys are never labels" rule.
- **low: "kind-0" in user copy.** "...publicados en Nostr como tu perfil kind-0." Ordinary
  users will not know what a kind is; "tu perfil público de Nostr" says the same.
- **low: placeholders are not localized** (`you@example.com`, `you@walletofsatoshi.com`).
- **low: the settings close button is a solid red circle**, which reads as a destructive
  action. The neutral `ModalHeader` close would match the rest of the app.

## Duplicated controls

- **low: `user-settings-button` is rendered twice on desktop**, one copy at 0×0. Harmless for
  people, confusing for tests and screen readers (two "Preferencias" buttons in the
  accessibility tree). Same pattern on other `data-testid`s the recorder hit.

## Third parties seen during the pass

- `wss://purplepag.es` answered HTTP 502 to every connection attempt (it is one of the three
  default profile lookup relays; see the first entry).
