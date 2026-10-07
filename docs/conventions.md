# Code conventions

Where a piece of code goes, and what a component file may hold. The folder table is in [../AGENTS.md](../AGENTS.md#where-code-goes); this page is the detail behind six of its rules: where a file goes, component files are markup, every picture lives in `src/assets/`, text goes through the type pieces, shared animations live in `ui/animations/`, and every modal and sheet uses the shared header and footer.

## Where a file goes

The layers are `src/components`, `src/hooks`, `src/services`, `src/utils`, `src/store` and `src/lib`. All of them are split the same way (round 28), and `tests/structure/module-layout.test.ts` holds them to it. `src/assets` (round 31) is a layer too, split by kind of picture rather than by feature ([Assets](#assets)).

1. **Nothing loose at a layer's root.** Every file sits in a module folder. Code used across features goes in `common/` (`hooks/common/useDismiss.ts`, `services/common/clipboard.ts`, `components/common/AnchoredMenu.tsx`, `store/common/multi-account.ts`) or, in `utils`, in a named shared topic (`format/`, `identity/`, `message-text/`, `relay-url/`, `nostr/`, ...).
2. **The same feature names in every layer.** A layer's top-level folders come from one module map (below; `MODULES` in the guard). A feature that has code in several layers uses the same path in each: `components/chat/dm/thread/DmThreadMenu.tsx`, `hooks/chat/dm/thread/useDmThread.ts`, `services/chat/dm/opt-in.ts`, `utils/chat/dm/pending.ts`, `store/chat/dm.ts`. A small layer may stop a level higher (`services/chat/dm/` is flat), but never renames: one folder name is spelled one way everywhere (no `dm-call` beside `call`, no `messages` beside `message`).
3. **A folder with sub-folders keeps only its entry loose.** Beside its sub-folders a folder holds its `index.ts` or its entry component (`components/social/FeedScreen.tsx`, `app/[locale]/app/AppGate.tsx`, `app/[locale]/app/mobile/PhoneShell.tsx`; the list is `ENTRY` in the guard) and nothing else. Files shared by a feature's sub-features go in its own `common/` (`services/nostr-bridge/common/`).
4. **A lib package is a folder with an `index.ts`** (`lib/nip-59/index.ts`, `lib/games/index.ts`).

The route tree follows rule 3: Next.js files (`page.tsx`, `layout.tsx`, `opengraph-image.tsx`, ...) stay where routing needs them, every other file of a folder with sub-folders sits in one. The app frame under `src/app/[locale]/app/` is the `shell` module: its hooks mirror it under `src/hooks/shell/` (`app/[locale]/app/mobile/rail/` reads `hooks/shell/mobile/rail/`) and its pure helpers are in `src/utils/shell/`.

**Naming.** Component files are PascalCase after their component, an acronym written as a word (`DmThreadMenu.tsx`, `FaqItem.tsx`); a component module of several pieces or of data is kebab-case (`columns.tsx`, `mdx-components.tsx`). Hooks are `useX.ts`. Everything in `services`, `utils`, `store` and `lib` is kebab-case. A store module's main store is its `index.ts` (`@/store/voice`); a second store in the module has its own name (`@/store/chat/dm`).

### The module map

| Module | What it is | Sub-features |
|---|---|---|
| `common` | Code used by several features | |
| `ui` (components only) | The design-system kit, by kind, an `index.ts` per group | `buttons`, `forms`, `overlays`, `layout`, `data`, `feedback`, `media`, `animations` |
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
| `marketing`, `guides`, `help`, `media-kit`, `seo` | The public site | `marketing`: `landing`, `site`, `showcase`; `guides`: `article`, `listing`, `mdx` (the guide artwork is in `src/assets/illustrations/guides/`) |

Folders one layer has and the others do not: `services/nostr-bridge/` (the bridge, behind its front door), `services/server/` (server-only code) and the `utils` shared topics; each is listed with its reason in `LAYER_ONLY`.

## Component files

A component file is markup. Reading one should tell you what is on the screen, not how the data behind it was worked out.

- **One exported component per file.** It reads its state and handlers from one view-model hook, `src/hooks/<module>/use<Component>.ts`, and its data from bridge and store hooks. Purely visual local state (an open/closed toggle, a hover, a ref to focus) may stay in the component as up to two `useState` / `useRef` calls. Everything else lives in the hook: effects, memos, callbacks, reducers, derived data, handlers with logic.
- **No re-exports.** A component file does not hand on another component (`export { Panel } from './Panel'`, `export { default } from ...`), nor, outside the ui kit, a helper: when a piece moves to its own file, its importers move with it. An `index.ts` barrel is the one file made of re-exports. `tests/components/components-only.test.ts` holds this.
- **Pure data shaping** (build rows, filter, sort, format) goes to `src/utils/<topic>/`, tested on its own.
- **Actions with side effects** (publishing, removing users, a confirm-then-act flow) go to `src/services/<topic>/`, tested on its own.
- **Tables.** Column definitions live in their own `columns.tsx` next to the component; every non-trivial cell is its own small component file. Toolbars, footers and similar regions are their own components. A feature with several parts gets a folder named after it.
- **Inline handlers** are fine when they only pass a value on: `onClick={() => vm.kick(row)}`, `onChange={(e) => vm.setFilter(e.target.value)}`, `rows.map((r) => <Row key={r.id} row={r} />)`. A handler that does two things, branches or computes belongs in the hook.

### The reference: the relay admin panel

`src/components/admin/relay-admin/` is the worked example. Before round 27 it was one 251-line file holding the rows, the filters, the selection, the bulk actions and three cell components.

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

Only the reasoned list in `scripts/markup-only/multi-component.ts`: the MDX component map (`guides/mdx/mdx-components.tsx`), the media-kit banner variants (`media-kit/kit/banners.tsx`), the two lazy-boundary modules (`app/mounts/lazy-mounts.tsx`, `games/table/LazyTables.tsx`) and the menu primitive's parts (`ui/overlays/menu.tsx`). Each entry carries its reason; the list only shrinks. The seven icon sets that used to be on it were split into one file per icon in round 31 ([Assets](#assets)).

### Route files

`page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx` and the other Next.js files follow the same rule. What Next.js requires a route module to export is allowed as it is: `generateMetadata`, `generateStaticParams`, `generateViewport`, the HTTP handlers of a `route.ts`, and the default export of an image or metadata route (`opengraph-image.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`). A page's default export is a component like any other.

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

**The baseline.** On 2026-10-07 the files that break the rule were frozen in `tests/components/markup-only-baseline.json`, per file and per kind (865 findings in 272 files when the guard landed, 803 in 266 at the end of round 27; `audits/obelisk/round27/WAVES.md` splits the rest into eight parallel waves). It only shrinks:

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

Every picture the app draws lives in `src/assets/`, one folder per kind (round 31). A component imports a picture; it never draws one.

| Folder | Holds |
|---|---|
| `src/assets/icons/` | Every UI icon, one `<Name>Icon.tsx` per icon, each drawn on `IconSvg.tsx`, all re-exported by `index.ts` (`import { CloseIcon } from '@/assets/icons'`) |
| `src/assets/brand/` | The Obelisk marks: `ObeliskIcon` (the app icon's silhouette), `ObeliskTwoToneMark` (the two-faced Obelisco on the phone login and the media-kit banners), `ObeliskOgMark` (the OG cards' corner mark), `GitHubMark`, and `embed-badge-mark.ts` (the glyph inside the media kit's copy-paste HTML badge, markup because other sites paste it) |
| `src/assets/illustrations/` | Artwork that is not an icon, by feature: `guides/` (heroes, diagrams, marks and their parts, with the registry `npm run snap-guides` renders), `seo/OgArt.tsx` (the OG card art), `games/` (the new-game picker thumbnails), `marketing/RelayPulse.tsx` |
| `src/assets/textures/` | Image files a stylesheet references with `url()` (`noise.svg`, the background grain of the desktop and phone shells); webpack serves them from `/_next/static/media/` |
| `public/` | Not an asset folder in this sense: only what must be served at a fixed URL stays there (favicon and manifest icons, OG PNGs and the guide snapshots, fonts, `sw.js`, the media kit's downloadable files) |

**Icons.** `IconSvg` is the frame: a 24-unit `viewBox`, `fill="none"`, a 1.8 `currentColor` stroke with round caps and joins, `aria-hidden="true"` and `focusable="false"`. Every icon takes `IconProps`: any `<svg>` attribute plus

- `size`: width and height in px, 16 by default; `size={null}` writes neither, for an icon a stylesheet sizes (`className="h-5 w-5"`, `.nav-item svg { ... }`);
- `title`: a spoken name for an icon that means something on its own; it renders a `<title>`, adds `role="img"` and drops `aria-hidden` (so does an `aria-label`).

A caller passes only what differs: `<ChevronRightIcon size={12} strokeWidth={2.5} />`, `<SearchIcon size={null} className="h-5 w-5" />`. An icon whose drawing is a filled glyph sets `fill="currentColor" stroke="none"` in its own file (`PlayIcon`, `PauseIcon`, `DragHandleIcon`); one drawn on another grid sets its `viewBox` (`DragHandleIcon`, `CaretDownIcon`). A variant that is the same drawing in another state is a prop, not a second file (`ZapIcon filled`, `StarIcon filled`, `MonitorIcon checked`); any icon can be filled with `fill="currentColor"` (the note actions do).

**One drawing, one icon.** Before adding an icon, look in `index.ts`. Two icons that look the same are one icon; when two drawings of one idea differ visibly (a shorter handle, a wider body), both stay under names that say how (`SearchIcon`, `SearchShortIcon`, `SearchWideIcon`; `LockIcon`, `LockMediumIcon`, `LockWideIcon`, `LockLargeIcon`). A component that only chooses which icon to show (by topic, by category) is a component like any other and is not named `...Icon` (`HelpTopicBadge`, `RailBadge`, `MediaCategoryGlyph`).

**Illustrations** are components that may read translated labels (`useTranslations`), and follow the component rules (markup-only, one component per file). The guide snapshot pipeline imports them from `src/assets/illustrations/guides/` and must keep producing byte-identical files (`tests/assets/illustrations/guides/snapshots-match.test.tsx`).

**Bundle size.** `next.config.ts` marks every module under `src/assets/` side-effect free for webpack, so a page that imports two icons from the barrel ships those two. Without it the barrel pulled about 4 kB gzip of icons into every page.

**Drawn from data.** SVG computed from live data at render time (a chart, a level meter, a QR code) may stay in its component, listed with its reason in `DATA_DRIVEN` in `tests/assets/assets-only.test.ts`. A static shape inside such a component still moves to assets. The list is empty today: the game thumbnails and the landing's relay pulse are drawn from fixed geometry, so they are illustrations.

`tests/assets/assets-only.test.ts` holds all of this: no `<svg>` or SVG shape in JSX, no `<svg` markup in a string or a stylesheet outside `src/assets/`; no `...Icon` component outside `src/assets/icons/` (the brand `ObeliskIcon` aside); only icon files, `IconSvg.tsx` and the barrel in that folder, every icon in the barrel; no two icon files with the same drawing.

## Type

Every heading, paragraph and form label outside the ui kit goes through one of three pieces (round 32), so text with the same role looks the same everywhere.

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

**`Label`** (`src/components/ui/forms/Label.tsx`) for every form label; `Field` renders it. Variants: `field` (`text-[11px] font-medium text-lc-muted`), `caps` (`text-xs uppercase tracking-wider text-lc-muted`), and the phone sheet labels `sheet` and `sheetMono`, kept as the inline styles they were so the sheet stylesheet's rules lose to them as before. A label that wraps its control (a toggle row, a file-picker pill) takes no variant and its own layout classes.

**Bundle size.** `Heading`, `Text` and `cn` are in nearly every chunk, so `next.config.ts` gives them one shared client chunk (`type`); without it webpack copied them into the layout chunk and each page chunk (seven copies, about 1.5 kB gzip on each page).

`tests/components/typography.test.ts` fails on a raw `<h1>` to `<h6>`, `<p>` or `<label>` in JSX under `src/components/` or `src/app/`, outside the ui kit and the phone sheet chrome (`src/app/[locale]/app/mobile/sheets/chrome/`). There is no baseline: it is zero.

## Animations

Shared motion lives in `src/components/ui/animations/` (round 32); a one-off animation that belongs to one feature stays with that feature (the game-over burst, the hero's floating bubbles).

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

- `src/app/[locale]/app/mobile/sheets/chrome/SheetHeader.tsx`: the centred sheet title with its accent glyph and an optional help line, an optional back chevron for a sheet with sub-views, the `confirm` shape (tinted icon circle, title, description) and the `identity` shape (an avatar beside a name and a mono line, the relay menu).
- `src/app/[locale]/app/mobile/sheets/chrome/SheetActions.tsx`: the full-width primary button (or a destructive one, `tone: 'danger'`) and the quiet cancel under it.

`tests/components/modal-chrome.test.ts` enforces it: a file that renders `<Modal>` or `<Sheet>` may not render its own `<h1>` / `<h2>`, `<header>`, `<footer>` or `CloseButton`, nor the phone shell's title classes; the shared pieces render those. Section headings inside a dialog's body use `<h3>` and below.
