# Onboarding: discovery hints

New accounts land on an empty shell. Nothing in the UI says that a relay is
a community rather than a server you have an account on, that the feed is
all of Nostr rather than the relay you're chatting in, or that the key *is*
the account. The hints explain each of those where it lives, the first time
you get there.

They are **not** a tour. There is no forced sequence, nothing dims, nothing
stops taking clicks, and no step demands attention before you can use the
app. A control you haven't met carries a dot; arriving on its screen shows
one small card beside it; dismissing it — or just using the control — ends
it for good.

## The pieces

| File | Role |
|---|---|
| `src/lib/hints/registry.ts` | Every hint: id, surface, anchor, copy keys, order |
| `src/store/hints.ts` | What this account has seen (`obelisk:hints:{pubkey}`) |
| `src/components/hints/HintDot.tsx` | The "something here" marker on a control |
| `src/components/hints/HintCallout.tsx` | The card, pinned to the control |
| `src/components/hints/HintHost.tsx` | Picks which hint is showing, one at a time |

## Adding a hint

1. Put `data-tour="<anchor>"` on the **real control**, not a wrapper — the
   callout is measured from its rect, and a full-width wrapper points the
   card at the middle of the screen.
2. Add an entry to `HINTS` with a `surface` (the screen that reveals it) and
   an `order` within that surface.
3. Add `hints.<id>.title` and `hints.<id>.body` to **both** locales.
   `src/i18n/locales.test.ts` fails the build if either is missing.
4. Optionally render `<HintDot hintId="<id>" />` inside a `relative` parent
   on the control, so it advertises itself before the screen is reached.

## Rules that keep it honest

- **A hint can never point at nothing.** `HintHost` only shows one whose
  anchor is in the DOM and laid out (`offsetParent !== null`). That is also
  why one registry serves both shells, and why conditional UI — voice off,
  no relays yet, DMs not opted into — drops its own steps with no condition
  field to maintain.
- **Using a control teaches it.** A delegated `pointerdown` marks the hint
  for whatever `[data-tour]` was clicked. Someone who already found the feed
  button is never told what the feed button is.
- **Ignoring is not dismissing.** Clicking elsewhere leaves the hint for
  next time; only "Got it", Escape, or using the control end it.
- **Muting is not seeing.** "Don't show tips" sets `muted`, leaving `seen`
  alone, so "Show tips again" restores the whole set rather than the
  remainder.
- **Per account.** Switching accounts clears the in-memory set before
  rehydrating — zustand's `rehydrate()` merges, so without the clear a fresh
  key would inherit the previous account's "already seen" and be told
  nothing.
- **Not cache.** `clearAllClientCacheExceptSession` deliberately leaves
  `obelisk:hints:*` alone: it isn't relay-derived and can't be rebuilt, and
  clearing the cache shouldn't restart the tour.

## Replay

- Desktop: `?` → "Show tips again" (`help-popover-replay-hints`).
- Mobile: Settings → Preferences → "Show tips again" (`mobile-replay-hints`).
