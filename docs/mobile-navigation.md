# Mobile navigation

The mobile shell (`src/app/app/mobile/PhoneShell.tsx`) is a state
machine driven by `window.history`. Every visible transition between
screens corresponds to one history entry — there is no React Router,
no NavController object, just `pushState` + `popstate`. This doc is the
canonical spec for which transitions exist, which animation each one
plays, and what the history stack should look like at every step.

Read this together with [`data-system.md`](./data-system.md) (relay
subs + connection lifecycle) and [`read-state.md`](./read-state.md)
(unread cursors that the inbox screen surfaces).

## 1. Three rendering layers

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────┐  │
│  │ 3. Modal sheet                                     │  │
│  │    msg-actions / zap-modal                         │  │
│  │    Slides up from bottom (`obelisk-sheet-up`)      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 2. Sub-screen overlay (`.drag-overlay`)            │  │
│  │    channel · dm-thread · profile-view · forum ·    │  │
│  │    voice-room · member-list · search · compose-dm ·│  │
│  │    settings-prefs · profile-edit                   │  │
│  │    Mounts/unmounts; uses `.screen-anim` slide      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 1. Top-level tab carousel (`.drag-layer`)          │  │
│  │    server | dms-list | inbox | settings-profile    │  │
│  │    All four always mounted; role classes shift     │  │
│  │    them between drag-prev / drag-curr / drag-next  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Bottom-nav (4 buttons + active highlight)          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Layer 1 never remounts during a session — the four `<ServerScreen />`
/ `<DmsListScreen />` / `<InboxScreen />` / `<SettingsProfileScreen />`
instances live in `.drag-slot` divs that flip CSS roles. Layer 2
remounts whenever the sub-screen changes (different `key` on
`.drag-overlay`). Layer 3 is a separate React subtree that mounts/un-
mounts on `nav.screen === 'msg-actions' | 'zap-modal'`.

## 2. Screen catalog

### Top-level tabs (carousel slots)

| Screen | Purpose | Bottom-nav label |
|---|---|---|
| `server` | Active-relay group list + channel browser | Servers |
| `dms-list` | DM thread list with follows + recents | DMs |
| `inbox` | Mentions, replies, reactions, zaps | Inbox |
| `settings-profile` | Profile editor entry + settings home | You |

`NAV_ORDER = ['server', 'dms-list', 'inbox', 'settings-profile']`
(`swipe-nav.ts:5`). Left-to-right is the spatial order users feel when
swiping or tapping nav buttons; this is the only ordering that
matters for animation direction.

### Sub-screens (overlay layer)

| Screen | Default parent | Typical entry points | Notes |
|---|---|---|---|
| `channel` | `server` | server (channel list) | NIP-29 group chat |
| `voice-room` | `server` | channel header, server, jump-to-voice | mesh or SFU |
| `forum` | `server` | server (forum-kind group) | forum-style group |
| `member-list` | dynamic | channel, voice-room | group members |
| `search` | dynamic | channel, server, inbox | message search (NIP-50) |
| `dm-thread` | `dms-list` | dms-list, compose-dm, inbox (reply) | 1:1 DM |
| `compose-dm` | `dms-list` | dms-list | new DM picker |
| `profile-view` | dynamic | inbox, channel, dm-thread | view user profile |
| `settings-prefs` | `settings-profile` | settings-profile | preferences |
| `profile-edit` | `settings-profile` | settings-profile | edit own profile |

"Dynamic" parents track the screen the user came from at navigation
time (stored in `nav.parentScreen`). Static parents fall back to
`SUB_TO_NAV` in `swipe-nav.ts` when the dynamic field is null (e.g.,
cold deep-link reload of `/app?u=<pubkey>`).

### Modal sheets (top layer)

| Screen | Default parent | Entry point | Notes |
|---|---|---|---|
| `msg-actions` | dynamic | long-press on message | floats over base screen, base never animates underneath |
| `zap-modal` | dynamic | msg-actions → "zap", message zap button | same lateral-suppression rule |

Sheets keep the underlying screen mounted (the sub-screen
overlay's `key` is derived from `nav.baseScreen`, so opening a sheet
doesn't remount the screen below). Both sheets push a history entry
but are **not** encoded in the URL — opening a sheet doesn't change
the address bar.

### Guest screens

| Screen | When |
|---|---|
| `login` | Pre-login; renders `<LoginModal>` directly, no carousel |
| `profile-setup` | First-run after login; not part of nav state |

These exist in the `ScreenName` union but are not reachable through
the carousel — they're rendered by the logged-out branch of
`PhoneShell` (`PhoneShell.tsx:~5634`).

## 3. Hierarchy and parent resolution

The "parent" of any sub-screen is the screen the user came from. We
track it in two places:

1. **Dynamic** — `nav.parentScreen`, set at `pushNav` time by every
   opener (`selectGroup`, `selectPeer`, `openProfile`, `openMembers`,
   `openMsgActions`, `openZap`). This is the truthful answer for the
   current session.
2. **Static** — `SUB_TO_NAV` in `swipe-nav.ts:13-26`, a fallback for
   the cold-deep-link case where the user lands on `/app?u=<pubkey>`
   directly. `urlFor` does encode the parent under `pr`, but a
   bookmark from an old build won't have it.

The resolved parent is what drives:

- The active bottom-nav highlight (`isActive(tab) ⇔ resolveParent(nav) === tab`)
- The swipe-neighbor calculation (`neighborsFor`)
- The horizontal-swipe target (`decideSwipeNav`)

```ts
// swipe-nav.ts
export function resolveParent(nav: NavState): ScreenName | null {
  if (NAV_ORDER.includes(nav.screen)) return null;   // top-level has no parent
  return nav.parentScreen ?? SUB_TO_NAV[nav.screen] ?? null;
}
```

`resolveParent` returns the **top-level tab** the screen belongs to,
not the immediate predecessor. So `profile-view` opened from a
mention notification resolves to `inbox`, not to the specific inbox
event entry. The active highlight follows the top-level tab; the
back arrow follows the immediate predecessor (which is just one
history pop).

## 4. Navigation triggers and animations

| Trigger | From → To | Animation | History op |
|---|---|---|---|
| Open sub-screen (`selectGroup`, `selectPeer`, `openProfile`, ...) | tab → sub, or sub → sub | `.screen-anim slide-forward` 260ms | `pushState` |
| Header back arrow (`backFromChannel`, etc.) | sub → predecessor | `.screen-anim slide-back` 260ms (popstate sets `slideDir='back'`) | `history.back()` |
| Bottom-nav: different tab | tabA / subA → tabB | drag-layer carousel translate 240ms, direction = sign(targetIdx − currentTabIdx) in NAV_ORDER | `pushState` (restores remembered sub-screen for target if any) |
| Bottom-nav: same tab while on sub-screen | subA → tabA (bare) | drag-layer carousel translate 240ms, direction = `back` | `replaceState` (sub entry becomes the bare tab) |
| Bottom-nav: same tab while bare | tabA → tabA | none | no-op |
| Swipe horizontal commit | tabA / subA → adjacent tab | drag-layer carousel translate 240ms, direction follows swipe | `pushState` |
| Swipe horizontal revert | unchanged | drag-layer translate back to 0 (240ms) | none |
| Settings sub-tab switch (`settings-profile ↔ settings-prefs`) | settings-profile ↔ settings-prefs | suppressed (the two tabs visually share a strip) | `pushState` |
| Open `msg-actions` / `zap-modal` | sub → sheet | `obelisk-sheet-up` 280ms; underlying screen does not slide | `pushState` |
| Close sheet | sheet → base | sheet-down; underlying screen does not slide | `history.back()` |
| Browser back on guard sentinel | guard → guard | exit toast (`"Press back again to exit"`) | re-pushes current nav |
| Browser back, second within 2 s on guard | guard → landing | none | `router.push('/')` |

**Why three different animation mechanisms?**

- **Sub-screen mounts** use a CSS keyframe (`slide-forward`/`slide-back`)
  applied to a fresh `.screen-anim` element. The element didn't exist
  before, so the keyframe fires once. Direction is set imperatively by
  `setSlideDir('forward' | 'back')`.
- **Carousel tab switches** translate `.drag-layer` imperatively via
  `dragLayerRef.current.style.transform`. This avoids re-mounting any
  of the four top-level screens — only their CSS role-class flips.
  Used for both swipe-commit *and* bottom-nav tap-switch so the two
  feel identical.
- **Sheets** use their own `.sheet-host` markup with a separate
  vertical keyframe. The base layer is forcibly suppressed
  (`suppressSlideRef.current = true`) so it doesn't double-animate.

## 5. History stack invariants

```
┌─────────────────┐
│ index 0: guard  │ ← sentinel, state.guard = true, URL matches parent or current
├─────────────────┤
│ index 1: parent │ ← (only if deep-link starts on a sub-screen)
├─────────────────┤
│ index 2: current│ ← user's actual screen
└─────────────────┘
```

- One entry per visually-distinct state change (a no-op nav must not
  push).
- The guard entry sits behind everything and is **never** popped past.
  First back-press lands on it, the listener re-pushes the user's
  current nav and arms a 2-second exit window.
- The relay-switch effect mutates the URL only —
  `replaceState(currentState, '', newUrl)` — and never adds entries.
- The seed-history function (`buildSeedHistory` in `swipe-nav.ts:99`)
  produces exactly `[guard, parentTab?, currentScreen]` based on the
  parsed URL.
- Same-tab-from-sub-screen taps replace the current entry rather
  than pushing a new one. This is what fixes the "press back twice"
  bug — the back stack from the bare tab leads where it would have
  led before the user entered the sub-screen.
- Sheets push entries but are not URL-encoded. Closing a sheet pops
  one entry and returns to the underlying screen without re-rendering
  it.

## 6. Tab-aware "where I was" memory

`lastSubScreenByTabRef` (in `PhoneShell` body) remembers the last
sub-screen the user was on for each top-level tab. When the user
switches to a different tab (via bottom-nav tap or swipe-commit),
the system:

1. Snapshots the current nav under the *leaving* tab's slot — unless
   the user is currently on the bare tab (then it clears the slot).
2. If the *target* tab has a remembered sub-screen, restores it as
   the new nav. Otherwise pushes the bare tab.

So: open channel-A on Servers, swipe to DMs, swipe back to Servers —
you're back on channel-A, not the channel list. Tap "Servers" while
already inside channel-A and you collapse to the bare channel list
(see Section 4 row 4).

Memory is cleared for the leaving tab if the user was on its bare
top-level: there's nothing to remember.

### Two animation paths for tab switches

`commitCarouselTransition` and the swipe-commit branch of
`finishDrag` both branch on whether the target tab has a remembered
sub-screen. They have to, because the two cases have opposite
visual contracts:

**Path A — no remembered (plain tab swap).** Animate the drag-layer
first, push the new nav after the 240 ms transition completes. The
leaving overlay (if the user was on a sub-screen) stays mounted
throughout the slide and rides inside the layer to the off-screen
side. The destination bare tab is already pre-rendered in the
neighbor slot (`drag-prev` / `drag-next`) and slides into view as
the layer translates. Crucially the channel does NOT unmount mid-
slide — without this, the leaving overlay disappears the instant
the layer starts moving and the user sees a "fade-away" glitch
instead of a clean slide.

**Path B — has remembered (restore previous sub-screen).** Push the
new nav FIRST via `flushSync`, then position the layer at the
offset that keeps the leaving screen visually at viewport center,
then transition to `translateX(0)`. The destination overlay is
mounted from the first paint and rides inside the layer along with
everything else, so the user sees their remembered channel sliding
in — never the bare destination tab flashing first.

In both paths the post-animation cleanup is identical: a 240 ms
timer flips `setIsDragging(false)`, the layout effect clears the
inline transform and resets `suppressSlideRef` in a rAF.

Rapid taps share a single `tabAnimTimerRef`; a new tap cancels any
pending cleanup timer from the previous animation so its
`setIsDragging(false)` doesn't interrupt the new in-flight motion.

## 7. Animation timing and cleanup

- `slideDir` is cleared by an `animationend` event listener on the
  active `.screen-anim` element, not a timer. This makes rapid
  re-navigation safe: each animation runs to completion or is
  replaced by a new one on a freshly-mounted overlay element.
- `suppressSlideRef.current = true` is the only legitimate way to
  skip a screen-anim slide. The flag is set by:
  - Settings sub-tab switch (lateral animation reads as broken).
  - Drag-layer commit (the carousel already animated the screen
    into place).
  - Sheet open (the underlying base must not laterally slide).
- After the drag-layer transition ends, a `useLayoutEffect` clears
  the inline transform on `.drag-layer` and resets `suppressSlideRef`
  + `slideDir` in a `requestAnimationFrame`, so the next render
  starts from a clean state.
- `prefers-reduced-motion: reduce` zeros the keyframe duration; a 1ms
  fallback animation still fires `animationend`, keeping the cleanup
  path consistent.

## 8. Common pitfalls (failure modes seen in the wild)

- **Redundant `pushState` for the current screen.** Tapping the active
  bottom-nav tab used to push another identical entry, doubling
  back-presses. Fixed by the same-tab no-op + replaceState branch in
  `onTabPress`. **Don't reintroduce this** for new nav triggers.
- **Calling `pushNav` from inside the `popstate` handler.** The
  handler should only `setNav` to mirror what `e.state.nav` says.
  The single exception is the guard re-push.
- **Compounded animations.** Translating `.drag-layer` *and* applying
  `.slide-forward` to the new `.screen-anim` produces a stuttery
  double-slide. The drag-layer commit must set `suppressSlideRef`
  before the new sub-screen mounts.
- **Static parent for cross-context screens.** `profile-view` from
  Inbox should highlight Inbox in the bottom-nav and swipe-right
  toward Servers. Always go through `resolveParent(nav)`; don't
  shortcut to `SUB_TO_NAV[nav.screen]`.
- **Forgetting to thread `parentScreen` through a new opener.** Any
  new sub-screen entry point must stamp `parentScreen:
  navRef.current.screen` at push time. Without this the new screen
  inherits whatever the static fallback decided, which is usually
  wrong for cross-tab entries.
- **Pushing on settings sub-tab switch with `slideDir='forward'`.**
  The two tabs visually share a strip; sliding them produces
  Refresh-Like flicker. The settings tab-switch branch in `go()`
  detects this pair and suppresses the slide.

## 9. Where the logic lives

```
src/app/app/mobile/
├── PhoneShell.tsx       (the state machine: go, pushNav, BottomNav,
│                         onTabPress, popstate handler, drag carousel,
│                         openers, screen renderers, seed/init)
├── url-state.ts         (NavState shape, urlFor/parseUrl, initialNav)
├── swipe-nav.ts         (NAV_ORDER, SUB_TO_NAV, resolveParent,
│                         neighborsFor, decideSwipeNav, decideSnap,
│                         buildSeedHistory)
├── mobile-shell.css     (.drag-layer, .drag-slot.*, .drag-overlay,
│                         .screen-anim slide keyframes, sheet keyframes)
├── use-keyboard.ts      (visualViewport keyboard inset)
└── navigation.test.tsx  (scripted nav sequences, history-stack assertions)
```

When you add a new screen or transition, the order of operations is:

1. Add the `ScreenName` to `url-state.ts`.
2. Decide its parent context — static (add to `SUB_TO_NAV`) or
   dynamic (thread `parentScreen` through the opener).
3. Add it to the screen catalog table in this doc.
4. Add its navigation row to the trigger table in Section 4.
5. Render it in the `body` switch in `PhoneShell.tsx`.
6. Add a test case to `navigation.test.tsx` covering the new trigger.
