# Clean code and modularity audit

Base: `reorg/pre-launch` at `09aa6739`. Work branch: `audit/clean-code-modularity`.

## Scope and approach

The baseline contains 2,197 files under `src/`. The audit combines repository-wide structural checks with manual review of screen composition, shared hooks, service boundaries and asynchronous state ownership. It does not claim an exhaustive review of every protocol implementation or real relay/browser interaction.

Four passes were completed: structure and component ownership; shared lifecycle and service boundaries; identity search and review of the resulting changes; an independent read-only review. Existing screen markup stays cohesive. Components are extracted for reuse, substantial independent sections or subscription/lifecycle boundaries, not for line-count reduction.

## Findings and fixes

| Finding | Result |
|---|---|
| Five desktop settings components only render another component; the mobile profile wrapper only renames props | Callers render the existing feature components directly; six unnecessary files removed |
| `useMobileServerRail` has no React lifecycle and only wraps an existing pure utility | The component calls `isActiveRelay` directly; removed the redundant hook and duplicate tests |
| Remote-media React bindings live in services and bypass the bridge front door | Moved to `hooks/media/remote/useRemoteMediaGate.ts`; removed the internal-import exception; related media tests pass |
| Read-state mounting combines persistence registration, React effects and asynchronous relay discovery in services | `ReadStateRoot` is a lifecycle component; `useReadStateRuntime` owns React effects; account-store registration and DM lookup/subscription ownership are services |
| Account switching reuses the prior account's DM relay list until a new lookup completes; changing relays retains the previous fallback subscription | Lookup and subscription share one cancellable lifetime; old subscriptions stop and late results cannot start new ones; failed lookup falls back to the current active relay |
| WoT persistence and browser bootstrap share a service file | Store moved intact to `store/wot/index.ts`; initialization remains in `services/wot/initialize.ts`; storage key and public facade preserved |
| Nine service form builders import their contract from a React hook | React-independent `FormSpec` and `FormValues` live in `constants/common/form.ts` |
| People search mixes network requests, wire parsing, shared types and React state | Constants/types, the NIP-05 resolver and pure result shaping have their own owning layers; the hook coordinates the React lifecycle |
| People search leaks old direct/NIP-05 hits during debounce, accepts non-text metadata fields and chooses the first profile rather than the newest | All stale hit types are hidden immediately; wire fields are narrowed to strings; newest metadata wins without changing search order |
| Feed pagination guards only successful completions by feed key | Per-request ownership guards success, failure and cleanup, allows a new feed to page independently and prevents duplicate same-tick requests and stale results after navigating away and back |
| A shared live-subscription flag revives callbacks from a closed feed | Each subscription has its own active flag; queued old deliveries cannot enter the current pending buffer |

## Verification

The baseline structural suite passed: 33 files, 225 tests. New regression tests were observed failing against the original behavior before the corresponding fixes. These cover account switches, relay fallback changes, stale pagination failures and successes, duplicate pagination, return visits, closed live subscriptions, stale identity hits and malformed/out-of-order metadata. Further read-state tests cover unmount, deferred startup, lookup failure and out-of-order account lookups.

Before integration, typecheck and repository-wide lint passed. The related suite passed 450 files / 3,188 tests; the final mobile rail cleanup passed 11 files / 104 tests. Structural guards passed 33 files / 225 tests. Source-byte and diff whitespace checks passed. The related run emitted jsdom notices for unsupported document navigation and canvas contexts but had no failing tests.

The final independent review found no actionable issue in the changes. It noted nonblocking gaps in direct coverage for reordered group membership and the pagination fallback's second relay request. These are useful future test cases; the review did not run live relays, browser workflows or independently rerun the test commands.

Release builds, SEO crawls and browser end-to-end checks are reserved for release work by this repository's instructions. Existing documented debt outside these changes remains in `AGENTS.md`; in particular, the two relay-URL functions have different validation contracts and should not be merged mechanically.
