# UI and interaction

Use the shared kit for repeated semantics and visual recipes; keep feature-specific composition with its feature. [Code conventions](conventions.md) define the enforced rules, while [architecture](../architecture/README.md) explains route and provider ownership.

## Choose the element by behavior

| Need | Shared component | Contract |
|---|---|---|
| Run an action | `ui/buttons/Button` | Button semantics, safe default type, keyboard focus and existing variants |
| Navigate or download | `ui/navigation/Link` | Locale-aware internal routes; native external, fragment and download anchors; centralized new-tab protection |
| Render a list | `ui/layout/List` | Bullet, numbered or unmarked lists; ordered attributes and explicit accessibility semantics for hidden markers |
| Show body or metadata text | `ui/layout/Text` | Shared size, tone and weight; `as="time"` with `dateTime` for machine-readable timestamps |
| Compose a repeated surface | `Container`, `PageSection`, `Card` | Width, spacing and card recipes without moving unique page content into thin wrappers |

Link variants are `plain`, `text`, `muted`, `prose`, `card` and `button`; button links reuse button variants and sizes. Pass locale-free internal paths. Use `native` for an already-localized destination, a fixed file or a feature protocol handler that needs browser navigation. Link does not sanitize untrusted URLs: the owning feature still validates them. Use buttons for actions and anchors for destinations rather than changing behavior to match a style.

List owns `<ul>` and `<ol>` styling while the caller owns the items and their content. Use `marker="none"` for unmarked rows and `as="ol"` when order has meaning. `start`, `reversed` and `type` preserve ordered-list behavior. Text does not replace headings or labels; use their dedicated primitives. Decorative or layout-only spans need no text wrapper.

## Cohesive pages and responsive shells

Extract a component for reusable markup, a lifecycle boundary or a substantial section with its own responsibility. A component that only renames props or forwards to another component is unnecessary. The public `(site)` layout shares navigation chrome; note/profile author details are reusable social feature content; the notes client viewer remains route-specific.

Desktop and mobile use one `/app` entry point. Their navigation models differ, so `AppGate` mounts one shell at the shared breakpoint. The bridge, read-state and active call lifetimes sit above that choice. The desktop sidebar is always inline; phone navigation remains a screen stack. Unvisited phone tabs do not mount their feed/profile contents until needed. See [app shell ownership](../architecture/app-shells.md) for the shared behavior and loading boundaries. Public `/desktop` and `/mobile` routes are product tours, not alternate app implementations. See [mobile navigation](mobile-navigation.md) for carousel/history behavior and [onboarding](onboarding.md) for account-scoped discovery hints.

## Feedback ownership

`src/store/feedback/toast.ts` is the single transient toast store. The locale root mounts `src/components/feedback/ToastStack.tsx` once, so producers in app, public viewer and mobile surfaces share the same host. The stack remains a mounted polite live region when empty, and separate keyboard-operable buttons open or dismiss each toast. A toast can carry an action and optional `durationMs`; `useToastStack` calculates its remaining lifetime from `createdAt` instead of restarting its lifetime on each update.

The mobile back-to-exit hint uses a two-second toast while its history hook independently controls whether the next back action exits. Navigation, account/relay changes, unmount and confirmed exit clear stale hints. Relay-copy results use the same host and report unavailable or failed clipboard operations as failures.

Do not turn every notification into a toast. Persistent inbox notifications and read cursors, operating-system notifications, operation diagnostics/activity indicators, and inline form validation have separate lifetimes and responsibilities. Keep them with their existing stores and UI. Temporary action feedback should use the toast store rather than add another local overlay.
