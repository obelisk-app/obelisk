# App shell audit, 2026-10-08

Scope: `/app`, its desktop and phone layout adapters, the hooks and feature components reachable from those shells, and their tests. The starting revision was `375847c9`. Independent passes examined responsive architecture and lifecycle ownership, reuse and component boundaries, and eager loading/render work. Follow-up review checked the fixes together. Current guidance lives in [app shell ownership](../../architecture/app-shells.md).

## Decision

Keep separate desktop panes and phone screen-stack layouts behind one application entry point. Their navigation and interaction models differ. Share feature behavior, persistent providers, destination encoding and reusable UI. Remove obsolete narrow-screen branches from the desktop layout rather than maintaining two phone implementations.

## Findings addressed

| Finding | Result |
|---|---|
| DM call listener owned by each shell; breakpoint unmount ran call cleanup | Authenticated AppGate owns the listener once; idle call UI is not downloaded |
| Persisted trust initialization only happened on desktop or after settings opened | Shared gate initializes it for either layout |
| Desktop drawer/backdrop/swipe behavior existed only below a breakpoint where desktop never mounts | Removed that dead state, handlers, controls and CSS branches; retained permanent resizable DesktopSidebar |
| Desktop and phone used incompatible destination serialization; viewport remount reseeded phone history | Shared channel/feed/DM codec adapters, retained history fields and single phone history seeding |
| Hidden initial phone tabs started profile/feed work | Activate tab contents on first use, parent need or swipe exposure, then retain them |
| Mobile profile callbacks were wrapped again on each render | Pass stable callbacks through screen adapters |
| Settings and media-library entry points pulled optional editors into eager shell dependencies | Lazy boundaries with usable loading/dismissal behavior |
| Add-relay tab/suggestion hooks and URL forms duplicated behavior | Shared relay hooks and form, with dialog/sheet presentation retained |
| Three author-name components duplicated the same subscription | Shared live UserName component |
| Feature code imported sheet controls from inside the phone route | Promoted sheet header/actions and BackButton to shared UI |
| Mobile bare-key search missed profile resolution; social search highlighted unverified handles | Shared identity-result model, passive verification state and visible npub fallback |

## Verification boundaries

Targeted tests cover responsive call lifetime, idle lazy imports, history handoff, Back/sentinel behavior, tab retention, swipe exposure, loading dismissal, shared form mutations and identity fallback/verification. Structural guards protect component ownership and eager dependency boundaries. Production bundle sizes and live browser performance were not measured in this development pass; source import graphs are not compressed bundle measurements.

Desktop reader stacks and open article/profile panes remain local to the desktop shell. Those transient panels do not transfer across the viewport breakpoint. Phone-only destinations retain their state while desktop displays an available parent, until a new desktop selection replaces them. These are explicit limits of the current adapters, not a claim that every pane state has been unified.
