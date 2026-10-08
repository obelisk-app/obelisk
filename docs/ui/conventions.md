# Code conventions

Where a piece of code goes, and what a component file may hold. The folder table is in [../AGENTS.md](../../AGENTS.md#where-code-goes); this page is the detail behind eight of its rules: where a file goes, what each layer holds, component files are markup, every picture lives in `src/assets/`, text goes through the type pieces, shared animations live in `ui/animations/`, every modal and sheet uses the shared header and footer, and forms are built from the common pieces.

## Where a file goes

The layers are `src/components`, `src/hooks`, `src/services`, `src/utils`, `src/constants`, `src/types`, `src/schemas`, `src/store` and `src/lib`. They share the module ownership rules below, and `tests/structure/module-layout.test.ts` holds them to it. `src/assets` is a layer too, split by kind of picture rather than by feature ([Assets](#assets)).

1. **Nothing loose at a layer's root.** Every file sits in a module folder. Code used across features goes in `common/` (`hooks/common/useDismiss.ts`, `services/common/clipboard.ts`, `components/common/AnchoredMenu.tsx`, `store/common/multi-account.ts`) or, in `utils`, in a named shared topic (`format/`, `identity/`, `message-text/`, `relay-url/`, `nostr/`, ...).
2. **The same feature names in every layer.** A layer's top-level folders come from one module map (below; `MODULES` in the guard). A feature that has code in several layers uses the same path in each: `components/chat/dm/thread/DmThreadMenu.tsx`, `hooks/chat/dm/thread/useDmThread.ts`, `services/chat/dm/opt-in.ts`, `utils/chat/dm/pending.ts`, `store/chat/dm.ts`. A small layer may stop a level higher (`services/chat/dm/` is flat), but never renames: one folder name is spelled one way everywhere (no `dm-call` beside `call`, no `messages` beside `message`).
3. **A folder with sub-folders keeps only its entry loose.** Beside its sub-folders a folder holds its `index.ts` or its entry component (`components/social/FeedScreen.tsx`, `app/[locale]/app/AppGate.tsx`, `app/[locale]/app/mobile/PhoneShell.tsx`; the list is `ENTRY` in the guard) and nothing else. Files shared by a feature's sub-features go in its own `common/` (`services/nostr-bridge/common/`).
4. **A lib package is a folder with an `index.ts`** (`lib/crypto/index.ts`, `lib/games/index.ts`).

The route tree follows rule 3: Next.js files (`page.tsx`, `layout.tsx`, `route.ts`, ...) stay where routing needs them, every other file of a folder with sub-folders sits in one. The app frame under `src/app/[locale]/app/` is the `shell` module: its hooks mirror it under `src/hooks/shell/` (`app/[locale]/app/mobile/rail/` reads `hooks/shell/mobile/rail/`) and its pure helpers are in `src/utils/shell/`.

**Naming.** Component files are PascalCase after their component, an acronym written as a word (`DmThreadMenu.tsx`, `FaqItem.tsx`); a component module of several pieces or of data is kebab-case (`columns.tsx`, `mdx-components.tsx`). Hooks are `useX.ts`. Everything in `services`, `utils`, `store` and `lib` is kebab-case. A store module's main store is its `index.ts` (`@/store/voice`); a second store in the module has its own name (`@/store/chat/dm`).

### The module map

| Module | What it is | Sub-features |
|---|---|---|
| `common` | Code used by several features | |
| `ui` (components only) | The design-system kit, by kind, an `index.ts` per group | `buttons`, `forms`, `overlays`, `layout`, `navigation`, `data`, `feedback`, `media`, `animations` |
| `shell` | The app frame at `/app` (components in `src/app/[locale]/app/`) | `desktop`, `mobile` (`carousel`, `chrome`, `nav`, `rail`, `screens/<screen>`, `sheets/<topic>`), `panes` (`channel`, `dm`, `message`, `reader`, `sidebar`, `topbar`), `modals`, `rail`, `search`, `settings`, `dm`, `login`, `user-panel`, `mounts` |
| `chat` | Group channels and DMs | `channel`, `composer`, `dm` (`composer`, `message`, `thread`, `unlock`), `forum`, `gallery`, `members`, `mentions`, `message`, `picker`, `pq`, `profile`, `search`, `slash`, `timeline`, `zaps` |
| `games` | Turn-based games played in a channel. Its own module, not a part of chat: it has its own lib package, services, store, dev harness and lazy downloads, and chat only embeds its card | `card`, `table`, `new-game`, `start-table`, `results`, `channel`, `chain-reaction`, `stacker`, `vesta` |
| `voice` | Voice and video rooms | `room`, `controls`, `status-bar`, `audio` |
| `call` | One-to-one DM calls | |
| `social` | The Nostr feeds | `feed`, `note`, `composer`, `article`, `profile`, `tags`, `viewer`, `widgets` |
| `relay` | Relay-wide data and actions: info, branding, emoji, roles, channel layout, bot commands, deep links, status | |
| `admin` | The operator's tools | `relay-admin`, `relay-roles`, `relay-emoji` |
| `settings` | The settings screens | `account`, `appearance`, `notifications`, `privacy`, `social-relays`, `wallet` |
| `preferences` | The person's preferences, read by every feature | |
| `identity` | People: NIP-05 checks, user search, names and keys | |
| `media` | Uploads, the media library, the remote-media gate | `library`, `upload`, `remote` |
| `wallet` | Zaps and Nostr Wallet Connect | |
| `notifications`, `read-state` | Alerts, badges, read cursors | |
| `feedback` | Activity indicator, toasts, error panel | |
| `moderation` | Mutes and blocks | |
| `wot` | Web of trust | |
| `login`, `analytics`, `local-data`, `hints`, `i18n` | The login widget's storage, consent and gtag, the on-device data inventory, onboarding hints, the runtime translator | |
| `marketing`, `guides`, `media-kit`, `seo` | The public site | `marketing`: `landing`, `site`, `showcase`; `guides`: `article`, `listing`, `mdx` (the guide artwork is in `src/assets/illustrations/guides/`) |

Folders one layer has and the others do not: `services/nostr-bridge/` (the bridge, behind its front door), `services/server/` (server-only code) and the `utils` shared topics; each is listed with its reason in `LAYER_ONLY`.

## What each layer holds

Round 32. The folders say where a feature's code is; this rule says what kind of code each layer may hold, so a reader knows a file's shape from its path. `tests/structure/layer-contents.test.ts` reads every file with the TypeScript parser (`scripts/layers/analyze.ts`) and has no exception list; `npx tsx scripts/layers/scan.ts [folder]` prints what breaks it.

| Layer | Holds | The guard fails on |
|---|---|---|
| `src/constants/<module>/` | Values and types: event kinds, timings, caps, storage keys, option lists, fixed page content | a function, arrow, method or class; JSX; a value imported from an app layer (a constant reads only other constants, `src/lib/` packages and npm packages; types from anywhere) |
| `src/types/<module>/` | Shared compile-time contracts, type-only imports/exports | runtime values, functions or side effects |
| `src/schemas/<module>/` | Runtime validation and normalization, including handwritten parsers | React, state/store/service value imports, storage, network or timers |
| `src/hooks/<module>/` | Hooks (`use*`) and their own types | an exported value that is not a hook: a helper, a constant, a component, a re-export |
| `src/utils/<module or topic>/` | Pure functions (and the error classes and types they work with) | an import of React, Next.js or zustand, or of a value from `src/hooks`, `src/services`, `src/store`, `src/components` or `src/app`; JSX; a storage, network or timer global (`localStorage`, `sessionStorage`, `indexedDB`, `fetch`, `WebSocket`, `setTimeout`, `requestAnimationFrame`, ...) |
| `src/services/<module>/` | Business logic and side effects: relays, the bridge, stores, storage, `fetch`, timers, the DOM's events, WebRTC | |
| `src/components/`, `src/app/` | Components ([Component files](#component-files)) | (`components-only` and `markup-only`) |

**Types and schemas.** A type describes a compile-time contract; it does not validate JSON, local storage or relay input. Shared contracts belong in `src/types/<feature>/` (forms, wallet connections, voice payloads), while component props and implementation-private types remain beside the component or implementation. SDK and mini-package contracts remain owned by those packages. Types derived from a constant or runtime schema stay with that definition, rather than duplicating its shape in a types file. Import shared contracts with `import type` so they add no runtime dependency.

A runtime schema validates or normalizes actual values. `src/schemas/preferences/preferences.ts` accepts `unknown`, restores valid fields and defaults malformed input; its persisted-data contract is in `src/types/preferences/preferences.ts`, and its defaults are in `src/constants/preferences/defaults.ts`. `src/schemas/common/form.ts` validates typed form input. Schemas remain pure; services load or save data and call them at the boundary. A schema library is optional: these handwritten validators already perform runtime checks. Pure formatting, list toggling and equality helpers stay in utils. If a schema library is introduced for a concrete need, infer its output type instead of maintaining a second matching interface.

**Constants: one rule.** A constant another file reads, a test included, lives in `src/constants/<module>/`; a constant only its own file reads stays in that file, unexported. So no file in hooks, utils or services exports a constant, and a file that would hold nothing but constants is a constants file in the wrong layer. When some constants of a file are read elsewhere, the file's whole family of exported constants moves together (the SFU's timeouts, the mention-seen thresholds), so a family is never split between two places. A value built from a service's own values (`LOCAL_DATA`, the inventory assembled from the inventory files) is not a constant in this sense and stays with its service; neither is mutable state (`new Map()`, a `{}` filled in later) or a computed object (`createHub()`).

**Where a constant goes.** `src/constants/<module>/<name>.ts`, named after the file or sub-feature that owns the values: a flat service's file keeps its name (`services/voice/sfu-rpc-support.ts` -> `constants/voice/sfu-rpc-support.ts`), a sub-feature's code shares one file (`hooks/chat/timeline/*` and `utils/chat/timeline/*` -> `constants/chat/timeline.ts`). A constants file never has sub-folders beside it, so rule 3 above never splits one. The utils' shared topics, the bridge (`nostr-bridge/`) and the server code (`server/`) keep their folder names here (`LAYER_ONLY` in the module-layout guard). Event kinds are `constants/nostr/nip-kinds.ts`, the one source of truth (`tests/constants/nostr/nip-kinds.test.ts`).


## Component files

A component file is markup. Reading one should tell you what is on the screen, not how the data behind it was worked out.

- **One exported component per file.** It reads its state and handlers from one view-model hook, `src/hooks/<module>/use<Component>.ts`, and its data from bridge and store hooks. Purely visual local state (an open/closed toggle, a hover, a ref to focus) may stay in the component as up to two `useState` / `useRef` calls. Everything else lives in the hook: effects, memos, callbacks, reducers, derived data, handlers with logic.
- **Cohesive screens.** Extract for reusable markup, a subscription/lifecycle boundary or a substantial independent section. Do not add a wrapper that only forwards props or renders another component: render the feature directly. Small subscription anchors and framework route files have real lifecycle/routing responsibilities and can stay small. Group related helpers and constants by responsibility; there is no one-function-per-file requirement. Keep private helpers local to their owning logic module, and do not add forwarding components or hooks solely to mirror folder structure.
- **No re-exports.** A component file does not hand on another component (`export { Panel } from './Panel'`, `export { default } from ...`), nor, outside the ui kit, a helper: when a piece moves to its own file, its importers move with it. An `index.ts` barrel is the one file made of re-exports. `tests/components/components-only.test.ts` holds this.
- **Pure data shaping** (build rows, filter, sort, format) goes to `src/utils/<topic>/`, tested on its own.
- **Actions with side effects** (publishing, removing users, a confirm-then-act flow) go to `src/services/<topic>/`, tested on its own.
- **Tables.** Column definitions live in their own `columns.tsx` next to the component; every non-trivial cell is its own small component file. Toolbars, footers and similar regions are their own components. A feature with several parts gets a folder named after it.
- **Inline handlers** are fine when they only pass a value on: `onClick={() => vm.kick(row)}`, `onChange={(e) => vm.setFilter(e.target.value)}`, `rows.map((r) => <Row key={r.id} row={r} />)`. A handler that does two things, branches or computes belongs in the hook.

### The reference: the relay admin panel

`src/components/admin/relay-admin/` is the worked example of separating table markup, state and actions.

| File | What it holds |
|---|---|
| `components/admin/relay-admin/RelayAdminPanel.tsx` | The modal: header, toolbar, table, footer. Calls `useRelayAdminPanel()` and nothing else |
| `components/admin/relay-admin/RelayAdminToolbar.tsx` | The three filters (text, role, channel) |
| `components/admin/relay-admin/columns.tsx` | The table's four columns |
| `components/admin/relay-admin/SelectCell.tsx`, `UserCell.tsx`, `RoleCell.tsx` | One cell each |
| `components/admin/relay-admin/RelayAdminFooter.tsx` | The counts and the two bulk actions, on `ModalFooter` |
| `hooks/admin/relay-admin/useRelayAdminPanel.ts` | The view model: filter state, selection, busy flag, the rows shown, kick and demote |
| `utils/admin/relay-admin-rows.ts` | Pure: build the rows, filter them, the row key, the selection toggle |
| `services/admin/relay-admin-bulk.ts` | Confirm, then remove each person or take their admin role |

### Files that may hold more than one component

Only the reasoned list in `scripts/markup-only/multi-component.ts`: the MDX component map (`guides/mdx/mdx-components.tsx`), the media-kit banner variants (`media-kit/kit/banners.tsx`), the two lazy-boundary modules (`app/mounts/lazy-mounts.tsx`, `games/table/LazyTables.tsx`) and the menu primitive's parts (`ui/overlays/menu.tsx`). Each entry carries its reason; the list only shrinks. Icons follow the [shared asset rules](#assets).

### Route files

`page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx` and the other Next.js files follow the same rule. What Next.js requires a route module to export is allowed as it is: `generateMetadata`, `generateStaticParams`, `generateViewport`, the HTTP handlers of a `route.ts`, and the default export of a metadata route (`sitemap.ts`, `robots.ts`, `manifest.ts`). A page's default export is a component like any other. There are no `opengraph-image` files: a page names its preview card in `generateMetadata` (`ogImage`, [docs/architecture/i18n.md](../architecture/i18n.md#seo)).

### The guard

`tests/components/markup-only.test.ts` reads every `.tsx` file under `src/components/`, `src/app/` and `src/assets/` (and the Next.js `.ts` route files) with the TypeScript parser (`scripts/markup-only/analyze.ts`) and counts six kinds of finding per file:

| Kind | Counts |
|---|---|
| `effects` | each `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useImperativeHandle` |
| `memos` | each `useMemo`, `useCallback` |
| `reducers` | each `useReducer` |
| `state` | each `useState` / `useRef` past the second in one component |
| `functions` | each function with logic, at the top level or nested (below) |
| `components` | each component past the first in the file, nested ones too, outside the reasoned list |

**A function has no logic** when it is an arrow (never the `function` keyword) whose body is one plain expression, or a block of at most one statement that evaluates or returns one. Plain means literals, names, property reads, calls whose arguments are plain, `!x`, `x as T`, `x!`, `await x`, templates of plain parts, object and array literals of plain values, JSX, and further arrows of the same kind. A conditional (`a ? b : c`), any operator (`&&`, `||`, `??`, `===`, `+`, `=`), `new`, a second statement, a local declaration or a control statement (`if`, `for`, `try`) makes it logic. JSX children are markup, not logic: `{open && <Menu />}` inside the returned tree is fine.

At the top level of a component file every non-component function counts (it is a helper: `src/utils/` or `src/services/`), with one exception: a **markup factory**, a function that only returns an object or array literal of plain values. That is the shape of a `columns.tsx`. The argument of a counted hook (an effect's body, a memo's factory) is not counted again.

The rule's own cases are the second `describe` in the test.

**The baseline.** `tests/components/markup-only-baseline.json` records existing findings by file and kind. It only shrinks:

- a file not in the baseline must have no findings;
- a listed file may not gain a finding of any kind;
- a listed file that lost some fails until the baseline is regenerated, so the room cannot be spent again.

Regenerate after fixing a file; never edit the JSON by hand:

```bash
npx tsx scripts/markup-only/baseline.ts                        # rewrite the baseline
npx tsx scripts/markup-only/baseline.ts --list src/components/voice   # what is left in a folder
npx tsx scripts/markup-only/baseline.ts --top 20               # the worst files
```

### Moving a component onto the rule

1. Write down what the component does today as tests (or check the existing suite covers it), and run them.
2. Move pure shaping into `src/utils/<topic>/` with its own tests; move side effects into `src/services/<topic>/` with their own tests.
3. Put the state, effects, memos and handlers in `src/hooks/<module>/use<Component>.ts` and return one object the markup reads.
4. Split extra components into their own files, in a folder named after the feature when there are several.
5. Run the same tests unchanged; regenerate the baseline; check `npx tsx scripts/markup-only/baseline.ts --list <file>` prints nothing.

## Assets

Every picture the app draws lives in `src/assets/`, one folder per kind. A component imports a picture; it never draws one.

| Folder | Holds |
|---|---|
| `src/assets/icons/` | Every UI icon, one `<Name>Icon.tsx` per icon, each drawn on `IconSvg.tsx`, all re-exported by `index.ts` (`import { CloseIcon } from '@/assets/icons'`) |
| `src/assets/brand/` | The Obelisk marks: `ObeliskIcon` (the app icon's silhouette), `ObeliskTwoToneMark` (the two-faced Obelisco on the phone login and the media-kit banners), `ObeliskOgMark` (the OG cards' corner mark), `GitHubMark`, and `embed-badge-mark.ts` (the glyph inside the media kit's copy-paste HTML badge, markup because other sites paste it) |
| `src/assets/illustrations/` | Artwork that is not an icon, by feature: `guides/` (heroes, diagrams, marks and their parts, with the registry `npm run snap-guides` renders), `seo/OgArt.tsx` (the preview cards' art), `games/` (the new-game picker thumbnails), `marketing/RelayPulse.tsx` |
| `src/assets/textures/` | Image files a stylesheet references with `url()` (`noise.svg`, the background grain of the desktop and phone shells); webpack serves them from `/_next/static/media/` |
| `public/` | Not an asset folder in this sense: only what must be served at a fixed URL stays there (favicon and manifest icons, the static pages' preview cards in `og/cards/` and the guide snapshots, fonts, `sw.js`, the media kit's downloadable files) |

**Icons.** `IconSvg` is the frame: a 24-unit `viewBox`, `fill="none"`, a 1.8 `currentColor` stroke with round caps and joins, `aria-hidden="true"` and `focusable="false"`. Every icon takes `IconProps`: any `<svg>` attribute plus

- `size`: width and height in px, 16 by default; `size={null}` writes neither, for an icon a stylesheet sizes (`className="h-5 w-5"`, `.nav-item svg { ... }`);
- `title`: a spoken name for an icon that means something on its own; it renders a `<title>`, adds `role="img"` and drops `aria-hidden` (so does an `aria-label`).

A caller passes only what differs: `<ChevronRightIcon size={12} strokeWidth={2.5} />`, `<SearchIcon size={null} className="h-5 w-5" />`. An icon whose drawing is a filled glyph sets `fill="currentColor" stroke="none"` in its own file (`PlayIcon`, `PauseIcon`, `DragHandleIcon`). A variant that is the same drawing in another state is a prop, not a second file (`ZapIcon filled`, `StarIcon filled`, `ScreenShareIcon checked`); any icon can be filled with `fill="currentColor"` (the note actions do, and the voice note's empty avatar is `UserIcon` filled).

**Illustrations** are components that may read translated labels (`useTranslations`), and follow the component rules (markup-only, one component per file). The guide snapshot pipeline imports them from `src/assets/illustrations/guides/` and must keep producing byte-identical files (`tests/assets/illustrations/guides/snapshots-match.test.tsx`).

**Bundle size.** `next.config.ts` marks every module under `src/assets/` side-effect free for webpack, so a page that imports two icons from the barrel ships those two. Without it the barrel pulled about 4 kB gzip of icons into every page.

**Drawn from data.** SVG computed from live data at render time (a chart, a level meter, a QR code) may stay in its component, listed with its reason in `DATA_DRIVEN` in `tests/assets/assets-only.test.ts`. A static shape inside such a component still moves to assets. The list is empty today: the game thumbnails and the landing's relay pulse are drawn from fixed geometry, so they are illustrations.

`tests/assets/assets-only.test.ts` holds all of this: no `<svg>` or SVG shape in JSX, no `<svg` markup in a string or a stylesheet outside `src/assets/`; no `...Icon` component outside `src/assets/icons/` (the brand `ObeliskIcon` aside); only icon files, `IconSvg.tsx` and the barrel in that folder, every icon in the barrel; no two icon files with the same drawing. `tests/assets/icon-style.test.ts` holds the [icon style](#icon-style): no two icons named for one symbol (a variant suffix, or two names from one synonym group); no icon file with its own grid, weight, caps, joins, colour or a square `<rect>`; no caller passing caps, joins, a grid or a weight outside the set.

### Icon style

Use one shared icon style:

- **Grid:** the frame's 24-unit `viewBox`, the drawing inside about 2 to 22. An icon file never sets its own `viewBox`.
- **Line:** an outline in `currentColor`, 1.8 wide (the frame's default), round caps and round joins. An icon file sets no stroke width, caps or joins, and no colour but `currentColor`.
- **Corners:** rounded. A `<rect>` always has an `rx` (2 for a frame, 1.5 for small tiles); a corner that is part of a path is a 2-unit arc where it is a box corner (`MaximizeIcon`, `DownloadIcon`).
- **Fills:** none, except filled glyphs (`fill="currentColor" stroke="none"`: play, pause, the drag handle) and small solid dots (`MoreIcon`, `DiceIcon`).
- **Exceptions** are listed with their reason in `STYLE_EXCEPTIONS` in `tests/assets/icon-style.test.ts`: only `ObeliskReactIcon`, the Obelisk mascot in brand colours on the add-reaction button.
- **Callers** may change the size (`size`, `className`) and, to keep a line legible at that size, the weight, from one set: 1.5 (large display icons), 2, 2.5 (small chevrons and arrows), 3 (icons of 10 px and under). Never caps, joins or the grid. A stylesheet that sets `stroke-width` on icons uses the same set.

**One symbol, one icon.** Before adding an icon, look in `index.ts`. Each meaning has one icon, drawn once, and every screen that means it uses it: there is one search lens, one padlock, one bin, one microphone (and its struck-through `MicOffIcon`), one bell, one speech bubble, one paper plane for sending and for the direct-messages entry. A name never says how a drawing differs (`Alt`, `Short`, `Wide`, `Large`, `Round`, a number): if the difference matters, it is a different meaning and gets a name that says the meaning (`MicOffIcon`, `CheckCircleIcon`, `StackIcon` for "several pictures"). A component that only chooses which icon to show (by topic, by category) is a component like any other and is not named `...Icon` (`HelpTopicBadge`, `RailBadge`, `MediaCategoryGlyph`).

## Type

Every heading, paragraph and form label outside the ui kit goes through one of three pieces, so text with the same role looks the same everywhere.

**`Heading`** (`src/components/ui/layout/Heading.tsx`). `as` (h1 to h4) is the level in the page's outline and is required; `variant` is the look, chosen by role, independent of the level. A variant is type only (size, weight, color, tracking): margins and layout stay in the caller's `className`. With no variant the heading adds no class, for one a stylesheet styles (the phone shell's `.app-header h2`, the login modal's `nui-form-title`).

| Variant | Classes | Role |
|---|---|---|
| `display` | `text-4xl md:text-6xl font-extrabold leading-[1.05] tracking-tight text-lc-white` | A marketing page's hero title (the showcases, `/features`) |
| `page` | `text-4xl md:text-5xl font-extrabold tracking-tight text-lc-white` | A content page's title (guides, help, local data) |
| `section` | `text-3xl md:text-4xl font-bold text-lc-white`, then a green `.` | A marketing section's title; `accent="?"` for the question, `accent={false}` for none |
| `article` | `text-2xl font-bold tracking-tight text-lc-white` | A heading inside a guide, a guide page's own section |
| `card` | `text-lg font-semibold text-lc-white` | A card's title; the title of a compact viewer page (note, profile, tag, relay link) |
| `cardLink` | `text-lg font-bold text-lc-white transition-colors group-hover:text-lc-green` | A card that is a link |
| `panel` | `text-sm font-semibold text-lc-white` | A heading in a panel, a settings block or a dialog body |
| `label` | `text-xs font-semibold uppercase tracking-wider text-lc-muted` | The small-caps heading over a group of rows |

A heading that fits no role keeps its classes on a variant-less `Heading` (the landing hero, the game-over headline). Dialog titles are not headings you write: `ModalHeader` and the phone's `SheetHeader` draw them.

**`Text`** (`src/components/ui/layout/Text.tsx`) for paragraphs (`as="p"`) and styled spans: `size`, `tone`, `weight`, and the body variants `caption` (`text-xs text-lc-muted`, the hint or status line), `muted` (`text-sm text-lc-muted`, secondary copy), `lead` (`text-lg text-lc-muted`, the intro under a title) and `label` (small caps). An explicit `size` or `tone` wins over the variant's. `Text` no longer renders headings or labels.

**`Field`** (`src/components/ui/forms/Field.tsx`) owns labelled controls in every form, including app dialogs. Pass the control ID as `htmlFor`; do not introduce route-local field wrappers. **`ToggleCard`** in the same folder presents a selectable option card with `aria-pressed`; the caller owns selection and supplies its icon and copy.

**`Label`** (`src/components/ui/forms/Label.tsx`) for every form label; `Field` renders it. Variants: `field` (`text-[11px] font-medium text-lc-muted`), `caps` (`text-xs uppercase tracking-wider text-lc-muted`), and the phone sheet labels `sheet` and `sheetMono`, kept as the inline styles they were so the sheet stylesheet's rules lose to them as before. A label that wraps its control (a toggle row, a file-picker pill) takes no variant and its own layout classes.

**Bundle size.** `Heading`, `Text` and `cn` are in nearly every chunk, so `next.config.ts` gives them one shared client chunk (`type`) to avoid duplicating these primitives across page chunks.

`tests/components/typography.test.ts` fails on a raw `<h1>` to `<h6>`, `<p>` or `<label>` in JSX under `src/components/` or `src/app/`, outside the ui kit (including the shared sheet chrome). There is no baseline: it is zero.

## Animations

Shared motion lives in `src/components/ui/animations/`; a one-off animation that belongs to one feature stays with that feature (the game-over burst, the hero's floating bubbles).

| Piece | What it is |
|---|---|
| `Reveal` | A block that fades up the first time it scrolls into view (`useScrollReveal`, `src/hooks/common/`); `as` picks `section` (the landing sections) or `article` (the showcase rows) |
| `ShootingStars` | The lime streaks behind the landing, the showcases, the logged-out screen, the welcome banner and the voice stage; hook `src/hooks/common/useShootingStars.ts`, loop `src/services/common/shooting-stars.ts` |
| `PingDot` | A status dot with a ping halo (the voice room header, the SFU and media-sync pills) |
| `PulseDot` | A pulsing status dot (recording, an active call, the relay status banner) |
| `Skeleton` | A loading placeholder: the `.lc-skeleton` shimmer, or `pulse` for the settings rows' pulse |

## Modal and sheet chrome

Every desktop dialog renders the same header and footer, so titles, spacing and buttons look alike everywhere:

- `src/components/ui/overlays/ModalHeader.tsx`. `bar` (the default): title and optional subtitle, an optional icon (decorative by default; `decorativeIcon={false}` for one that names itself, like a game preview) or back chevron before the title, extra controls (tabs, a copy button) as children, the close button at the right, a hairline below. `alert`: a centred title under a tinted icon circle (`tone` `danger`, `accent` or `warning`), no close button; the confirmation dialogs.
- `src/components/ui/overlays/ModalFooter.tsx`. `bar`: status text on the left (`meta`), the dismiss button (`cancel`) and the actions on the right (`actions`, the main one last; `tone` `primary`, `danger`, `secondary` or `zap` picks the one look for that role, `zap` being the yellow pill with the zap icon every Lightning payment uses), a hairline above. `alert`: the same buttons stacked full width on a phone and in a right-aligned row from `sm` up.

The phone shell has its own sheet design and keeps it, consistent within itself:

- `src/components/ui/overlays/SheetHeader.tsx`: the centred sheet title with its accent glyph and an optional help line, an optional back chevron for a sheet with sub-views, the `confirm` shape (tinted icon circle, title, description) and the `identity` shape (an avatar beside a name and a mono line, the relay menu).
- `src/components/ui/overlays/SheetActions.tsx`: the full-width primary button (or a destructive one, `tone: 'danger'`) and the quiet cancel under it.

`tests/components/modal-chrome.test.ts` enforces it: a file that renders `<Modal>` or `<Sheet>` may not render its own `<h1>` / `<h2>`, `<header>`, `<footer>` or `CloseButton`, nor the phone shell's title classes; the shared pieces render those. Section headings inside a dialog's body use `<h3>` and below. `SectionHeader` (`src/components/ui/layout/SectionHeader.tsx`) pairs a compact heading with an optional trailing hint in panels or forms; it does not belong to a modal route.

## Forms

Round 34. Every form is the same three things: the `Form` element, the one `useForm` hook, and a small spec that says what is particular to it. `tests/components/forms.test.ts` holds the first two.

**The element.** `src/components/ui/forms/Form.tsx` renders the `<form>`: `form={form}` wires the id, the submit and `aria-busy` from `useForm`; `noValidate` is on (the spec checks, and says why in the reader's language; `browserValidation` turns the browser's own checks back on); `error` draws a `FormError` as the last child. Its `layout` is picked by role, not per screen:

| Layout | Where |
|---|---|
| `bare` | no layout of its own: composers, search rows (the caller's classes) |
| `stack` | a short desktop form or inline editor |
| `sections` | a dialog body of titled sections |
| `sheet` | a phone sheet's fields |
| `row` | one wrapping line: field, toggle, submit (add a member) |
| `card` | a standalone form on its own page, inside `CenteredPage` (the voice join page) |

`FormError` (`inline`, `box`, `sheet`) draws nothing while the message is empty, so a form passes `form.error` as it is. `FormActions` is the submit row of a form that is not in a dialog or a sheet: `block` (a page card's full-width pill), `start` (an inline editor: save, then cancel), `end` (a form in a dialog tab), `sheet` (the phone shell's `.btn-primary` in a sheet tab). A dialog's form submits through `ModalFooter` (`actions: [{ form: form.id }]`), a sheet's through `SheetActions` (`primary: { form: form.id }`), so Enter in a field and the button do one thing; `Sheet` itself is never the form.

**The state.** `useForm(spec)` (`src/hooks/common/useForm.ts`) holds the values (`values`, `set`, `setValues`, `field(name)` to spread on an `Input` or `TextArea`), `dirty`, `adopt(values)` for values that arrive late (a profile from a relay; ignored once the person has typed), `submitting`, `error` and `canSubmit`. `submit` refuses a second submit while one is in flight, clears the last error, checks `ready` (not ready: nothing happens, nothing is said) and `validate` (a message key, shown), runs the spec's `submit`, and turns a throw into a sentence with `errorText` and the spec's `failure` key. `reset` goes back to the starting values.

**The spec.** A form keeps only its own description, as a builder next to the service it calls, `src/services/<module>/<name>-form.ts` returning a React-independent `FormSpec` from `src/types/common/form.ts`: `initial`, `ready`, `validate`, `submit`, `failure`, `onSuccess`, `resetOnSuccess`. Shared validation lives in `src/schemas/common/form.ts` (`filled`, `allFilled`, `isRelayAddress`, `parseMemberKey`); value shaping and comparisons live in `src/utils/common/form-values.ts` (`trimmedValues`, `sameValues`). A component calls `useForm(addRelayForm(onAdded))` directly; there is no per-form hook.

| Spec | Form |
|---|---|
| `services/voice/join-form.ts` | the `/voice` join page |
| `services/relay/add-relay-form.ts` | the custom add-relay tab (rail dialog and phone sheet), the suggested-relay Add |
| `services/relay/branding-form.ts` | relay branding (modal and sheet) |
| `services/chat/channel/create-channel-form.ts` | a new channel (sidebar and sheet) |
| `services/chat/channel/channel-settings-form.ts` | channel metadata and adding a member (modal and sheet) |
| `services/chat/forum/new-thread-form.ts` | a new publication (modal and sheet) |
| `services/session/profile-form.ts` | the kind 0 profile (desktop panel and phone screen) |
| `services/games/new-game-form.ts` | opening a game table |
| `services/wallet/nwc-connect-form.ts` | connecting a wallet |

**When a hook stays.** A `use...Form` hook exists only for behaviour a spec cannot hold, and composes `useForm`: `useChannelSettingsForm` (the SFU `/info` check, seeded from the pin), `useProfileEditorForm` (the late profile, upload progress), `useNewGameForm` (the two steps, reading a save file), `useMessageZapForm` (sending stays with `useSendZap`'s double-pay guard).


## Shared controls and layout

Every route, including mobile and development screens, uses the controls in `src/components/ui/`: `Button` or its specialized button primitives, `Input`, `Select`, and `TextArea`. Native controls are implemented only inside the UI kit. The guards enforce zero raw buttons and form controls outside it.

Choose an existing visual button variant first. Phone actions use `mobilePrimary`, `mobileSecondary`, `mobileDanger`, `mobileIcon`, or `mobileRow`; their stylesheet recipes stay scoped to the phone shell. `bare` is for compound controls whose geometry belongs to their feature, such as game cells, media tiles, and navigational rows. It supplies the shared keyboard focus and safe default button type without injecting padding, display, or disabled opacity that changes those controls. Do not use it to duplicate an existing action recipe. Standard button variants own their padding, shape, color and type size; call sites pass layout classes only and choose another variant for another appearance. Icon-only actions use `IconButton` with its size, shape and tone options; its ghost tone handles pressed and expanded states centrally. `tests/components/button-recipes.test.ts` checks standard Button callers for conflicting resting recipes, including conditional class strings.

Use `Card` for repeated surfaces, `Panel` for cards with a separated title/action header, and `Section` for titled content groups (`article`, `prose`, `mobile`, or compact `settings`). Settings sections select the mobile or compact heading recipe and use `contentClassName` only when the body needs its own row wrapper. Use `Row` and `Stack` for reusable alignment and spacing. Plain `div` and semantic elements remain appropriate for unique structural markup; extracting every wrapper into a component adds indirection without centralizing a responsibility. Screen components should retain meaningful composition rather than only forwarding props.

Use `Link` from `ui/navigation` for anchors. Its variants are `plain`, `text`, `muted`, `prose`, `card`, and `button`; button links reuse the button kit's variant and size recipes. Internal routes use locale navigation, while external URLs, fragments and downloads keep native anchors. Use `native` explicitly for already-localized destinations, files or feature protocol handlers. Preserve feature-level URL sanitization and pass its result to the link; the primitive is not a sanitizer. New-tab links add `noopener noreferrer` centrally.

Use `List` for bullet, numbered and unmarked lists. It owns marker and spacing recipes, preserves ordered-list attributes and supplies the Safari accessibility role when markers are hidden. Use `Text` for repeated label and metadata styles, including `as="time"` with `dateTime` for timestamps. Layout-only or decorative spans remain plain elements.

### Page ownership and container recipes

A route owns its single-use page composition and metadata. Public pages share navbar, footer, background and their common public translation scope in `[locale]/(site)/layout.tsx`; only routes needing extra client messages add a nested scope. Do not introduce a page component whose only caller is a forwarding route. Keep separate client components when they own browser state or a reusable interactive island; server routes must not become client components merely to inline them.

`Container` owns `mx-auto` and a named maximum width, with optional centered text and semantic element selection. `PageSection` owns the standard `px-6 py-24` rhythm; `reveal` applies the existing animation to the same section element. `Card variant="interactive"` owns the themed `lc-card` surface and hover treatment, `glow` adds the shared glow, and padding variants include feature and hero insets. `asChild` styles a single existing Link, Button or other element without adding a nested interactive control or an extra DOM wrapper. A modal selects this recipe with `surface="card"`. Unique positioning and responsive overrides remain at the call site.

`tests/components/layout-recipes.test.ts` rejects the repeated card, centered-container and standard section-spacing recipes outside UI. It does not ban structural divs or centered text measures on typography components.


## Global transient feedback

Use the singleton toast store and the locale-root ToastStack for temporary action feedback, including mobile exit hints and relay-copy results. The mounted polite live region, per-toast lifetime and keyboard controls belong to that shared host. Producers own the meaning, action and any cancellation of stale feedback. Persistent inbox notifications, operating-system notifications, diagnostics and inline validation remain separate. See [UI feedback ownership](README.md#feedback-ownership) for the source map and lifecycle contract.

## Session consumers

Identity and current-user profile hooks live in `src/hooks/session/useSession.ts`; their context and provider live under `src/contexts/session/` and `src/providers/session/`. Use `useSessionActions` for login, logout and profile editing. Other users' profiles and relay content still use the bridge hooks. See [session ownership](../architecture/session.md) for subscription and lifetime contracts.
