# App shell ownership

`/app` is one application with two layout adapters. `AppGate` mounts the phone shell below 1024px and the desktop shell at or above that breakpoint. It does not render both trees and hide one with CSS. Public `/desktop` and `/mobile` pages are product tours, not separate applications.

## Keep the layouts distinct

Desktop supports a permanent relay/channel sidebar, resizable panes, simultaneous feed and reader content, and pointer-oriented message controls. Phone navigation uses a full-screen stack, browser Back, swipe transitions, touch controls and bottom sheets. A single component containing both interaction models would add conditional branches and make lifecycle ownership less clear. CSS remains the right tool for sizing and spacing inside each shared feature.

`DesktopSidebar` is always inline while the desktop shell is mounted. The old below-768px drawer, hamburger and edge-swipe behavior were unreachable under the 1024px shell gate and have been removed. New desktop behavior must be reachable within its actual viewport range.

## Share behavior and persistent lifetimes

| Responsibility | Owner |
|---|---|
| Session and bridge instance | `mounts/AppProviders.tsx` mounts `BridgeProvider` and its nested `SessionProvider`, above shell selection |
| Read state and channel voice playback | Authenticated mounts in `AppGate.tsx` |
| DM call listener and call UI lifecycle | `LazyDmCallLayer` in authenticated `AppGate`; call UI loads only once status leaves idle |
| Social relay initialization and persisted trust settings | `useAppGate`, for both layouts |
| Channel, feed and DM destination serialization | Shared URL codec with the desktop adapter in `src/utils/shell/desktop/navigation.ts` |
| Channel composition and publication | `useChannelComposer` and chat services; each shell adapts its input events and presentation |
| Add-relay tabs, suggestions and URL form | `src/hooks/relay/rail/` and `src/components/relay/CustomRelayForm.tsx` |
| Search identity resolution and passive verification state | `src/hooks/identity/useIdentitySearchResult.ts` |
| Live author-name subscriptions | `src/components/identity/UserName.tsx` |
| Sheet titles/actions and Back control | Shared UI primitives; owning screens keep their contents and navigation |

Unmounting a layout must not end an active call. Logout still unmounts the authenticated call listener and retains its cleanup behavior. Search rows resolve bare keys consistently and only indicate verification when that public-key/handle pair was verified; passive rows do not fetch a profile-supplied domain merely to draw a badge.

The [session provider](session.md) shares identity and current-user profile subscriptions across both shells. Account actions and selector hooks have one owner; layout changes do not recreate the login system.

## Navigation continuity

Both layouts serialize channels, feed and DMs through the same codec. Desktop history updates retain framework and custom state, and clear obsolete destination parameters when the user selects a new view. Phone-created history entries carry a marker so returning to the phone layout does not add another exit guard and parent stack. Desktop Back skips the phone-only exit sentinel.

A phone-only destination is retained while desktop shows its available parent, until an explicit desktop selection replaces it. Returning to phone restores the retained destination. Desktop reader stacks, article panes and profile panes remain local to that shell; their open state does not transfer across the breakpoint. Sharing these transient pane models would require a separate navigation design, not just a responsive wrapper. See [mobile navigation](../ui/mobile-navigation.md#responsive-destination-handoff).

## Load when needed

Phone carousel slots keep stable positions, but their contents first mount when active, needed as a parent, or exposed by a swipe. Once activated, a tab remains mounted to retain its draft, scroll and local state. This avoids starting hidden feed/profile subscriptions on first entry while preserving subsequent tab behavior. Background DM/read-state owners remain outside this activation rule.

Preferences, the media library and idle call UI have lazy boundaries. Media-library callers share the same loading behavior, including a dismissible modal fallback. Stable profile callbacks pass through mobile screen adapters without allocating another wrapper and invalidating memoized feed rows.

Import-graph tests protect these boundaries. Source reachability is useful evidence about eager dependencies, but it is not a measurement of compressed production downloads. Production bundle and browser checks belong to the release verification procedure in [AGENTS.md](../../AGENTS.md#testing).
