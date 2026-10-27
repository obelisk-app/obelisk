# Flow review, 2026-10-26 (from the recording pass)

Problems found while recording obelisk.ar for the landing page and the guides,
with the throwaway persona "Capitán Mate" (`npub13xl44zwhc2plc40ry8ed82zhskq27j5kn3fnzrawx0vkdgc7nh8q7k4xlk`)
on production, Chromium, 1920×1080 and 412×915 phone emulation, Spanish UI.
Each entry says what was seen, where, and a suggested fix; **Fixed** marks the ones resolved
on 2026-10-27 (with the commit), **Open** the ones still to do.
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
  **Fixed** (`03e0b6e7`): the own-profile lookup passes `deadRelaysAnswerEmpty`, so a relay that
  closed the REQ or could not connect counts as answering "nothing"; a relay that connected and
  went quiet still keeps the guard. Test: `tests/services/nostr-bridge/profile/profile-save-dead-relay.test.ts`.
- **medium: the error it shows is wrong.** The save fails with "No se pudo cargar tu perfil
  actual. Probá de nuevo." on a profile that does not exist yet, and trying again cannot help.
  **Fixed** with the entry above: the error now only fires for a relay that connected and never answered.
- **low: a dead relay held every publish for about 4 s.** (First logged here as "the save hangs
  for minutes"; that was the recorder waiting for a Save button the successful save had already
  closed, not the app.) The hub's per-relay ack window waited for `purplepag.es` to connect
  before the live relays' OKs counted. **Fixed** (`03e0b6e7`): `publishRoundSettling`
  resolves once one relay accepted and every relay still pending is down; slow but connected
  relays get `PUBLISH_STRAGGLER_GRACE_MS` and keep receiving in the background.
- **medium: `nostr.build` can never take a browser upload.** Its `OPTIONS /upload` preflight
  has no `Access-Control-Allow-Origin`, so every profile upload spends a failed request on it
  (`BLOSSOM_SERVERS`, `src/constants/media/blossom.ts`). `blossom.primal.net` passes the
  preflight but its `PUT` failed with no CORS header on the response (likely an error
  status without CORS headers). Suggested fix: drop `nostr.build` from the browser list, put
  `blossom.band` first, re-measure primal.
  **Fixed** (`2182c94e`): the list is `blossom.band`, `blossom.primal.net` (a signed upload to
  both returned 200 with `Access-Control-Allow-Origin: *` when measured).
- **medium: a non-whitelisted user lands on an empty app with no way forward.** Desktop: a
  modal "No estás en la whitelist de public.obelisk.ar" *and* a toast saying the same thing,
  then an empty sidebar and the empty state "Elegí desde la barra lateral o tocá + para crear
  un canal", which a non-member cannot do. Phone: "Tenés que estar en la whitelist", no
  action. Suggested fix: one notice, and an empty state that says how to get in (ask the
  operator, with the npub ready to copy, or open the public relay list).
  **Fixed** (`c2660f2b`): the dialog no longer opens for `restricted` (the status row in the
  activity stack stays, the e2e spec reads it); desktop and phone empty states show
  `RelayAccessHelp`: the relay, "ask the operator", the npub to copy, and "Elegir otro relay".

## Login and onboarding

- **medium: the login modal is half translated.** On a Spanish UI the title ("Conectate a
  Nostr / Elegí cómo entrar") is Spanish but every method ("Browser extension", "Remote signer
  (bunker)", "Create a new account", "Paste private key", "Get the Nostr WoT extension") and
  the next steps ("Your new key", the backup checkbox, "Continue", "Sign in", the paste
  warning, `nsec1... or 64-char hex`) are English. These come from the `@nostr-wot/ui` login
  widget; it needs Obelisk's strings passed in, or its own es/pt catalogues.
  **Fixed in Obelisk, upstream still needed** (`dcb71963`): the widget (0.8.2, and 2.0.1 on
  npm) takes no label props, so `useSdkLoginCopy` swaps its English text nodes for Obelisk's
  `shell.login.sdk.*` messages in place (`src/constants/session/sdk-login-copy.ts`); a test
  checks every string against the installed package, so an SDK rewording fails CI instead of
  showing English. Upstream ask for `@nostr-wot/ui`: a `labels`/`messages` prop on
  `LoginWidgetProps`, then this workaround goes. The downloaded nsec `.txt` is still English.
- **low: the "Your new key" copy has em dashes** (between "Private key (nsec)" and "keep
  secret", and before "there's no recovery"), which the repo bans everywhere else.
  **Fixed** with the entry above (Obelisk's copy has none); the SDK's default copy still does.
- **low: the paste-key step renders a checkbox nobody can see.** **Not a bug** on Obelisk's
  side: it is the SDK's "Remember on this device" box, hidden on purpose (`globals.css`)
  because the widget runs on memory-only storage. Upstream ask: make `showRememberToggle={false}`
  actually remove it.
- **low: a pasted-key login skips the profile step** the new-account flow shows, so the user
  is left as "Vos" / "Anónimo" with no prompt to name themselves. **Open**: needs a dependable
  "this account has no profile" signal first (a lookup that failed must never lead to a new
  kind 0 overwriting a real one) and an Obelisk-owned profile form.

## Profile and settings

- **medium: Save and Cancel are cut off at 1080p.** In Settings > Perfil the action row sits
  below the dialog's bottom edge; the button is visible only after scrolling inside the
  dialog. Make the footer sticky (or use `ModalFooter`).
  **Fixed** (`c2660f2b`): the action row is sticky at the bottom of the scroll area.
- **low: three different avatar fallbacks for one account.** Sidebar "89", settings header
  "8", profile editor "0". One fallback (the identicon or the first letter of the name).
  "89" and "8" are hex digits of the pubkey, close to the "keys are never labels" rule.
  **Fixed** (`c2660f2b`): one recipe everywhere (`avatarInitials`): the name's initial, else
  the npub's first characters after `npub1`, never hex; the editor got the real pubkey.
- **low: "kind-0" in user copy.** "...publicados en Nostr como tu perfil kind-0." Ordinary
  users will not know what a kind is; "tu perfil público de Nostr" says the same.
  **Fixed** (`c2660f2b`) in settings; the marketing and showcase pages still say "kind 0".
- **low: placeholders are not localized** (`you@example.com`, `you@walletofsatoshi.com`).
  **Fixed** (`c2660f2b`): `shell.user.placeholder.*` in en, es and pt, desktop and phone.
- **low: the settings close button is a solid red circle**, which reads as a destructive
  action. The neutral `ModalHeader` close would match the rest of the app.
  **Fixed** (`c2660f2b`): the neutral `CloseButton`.

## Duplicated controls

- **low: `user-settings-button` is rendered twice on desktop**, one copy at 0×0. Harmless for
  people, confusing for tests and screen readers (two "Preferencias" buttons in the
  accessibility tree). Same pattern on other `data-testid`s the recorder hit.
  **Fixed** (`c2660f2b`): a desktop sidebar footer that could never show (`md:hidden` in a shell
  that only renders from 1024px) held a second user panel; it is gone, and with it a second
  "open settings" listener that stacked two settings panels.

## Found while recording the hero loops (2026-10-27)

- **low: the last channels hide behind the user panel.** At 1280×800 the sidebar's final rows
  ("Canal Robert", a new channel) sit under the "Capitán Mate" panel at the bottom; a click
  there lands on the panel. The channel list needs bottom padding equal to the panel's height
  (or the panel should not overlap the scroll area). **Open.**
- **low: a new, empty channel says "Cargando mensajes..."** instead of an empty state, until
  the first message arrives. **Open.**
- **low: the "No hay mensajes anteriores" pill overlaps the first message** at the top of a short
  history (desktop and phone). **Open.**
- **low: "kind 9" in the activity toast** ("Publicado · Enviar mensaje · kind 9"). The kind id
  is jargon; the description alone says it. **Open.**
- **low: on the phone, your own new message flashes as `npub13xl44...4xlk`** with a placeholder
  avatar for a moment before your name and picture appear. **Open.**

## Third parties seen during the pass

- `wss://purplepag.es` answered HTTP 502 to every connection attempt (it is one of the three
  default profile lookup relays; see the first entry).
