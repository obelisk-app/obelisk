# Nostr WoT SDK development and releases

Obelisk consumes published npm packages from [nostr-wot/nostr-wot-sdk](https://github.com/nostr-wot/nostr-wot-sdk). Production dependencies must resolve from the registry, not a sibling checkout or a local tarball.

## Ownership

| Package | Shared responsibility |
|---|---|
| `@nostr-wot/relay` | Relay URL parsing and explicit transport/public-host policies |
| `@nostr-wot/relay/hub` | Relay connections, identities, authentication, subscriptions, queries and publishing |
| `@nostr-wot/data` | Nostr identifiers, event collections, hashtags, profiles and event parsers |
| `@nostr-wot/blossom` | Upload hashing, authorization, server fallback, descriptor validation and ephemeral encrypted-blob uploads |
| `@nostr-wot/dm` | Gift wrapping, self-addressed envelopes and encrypted attachment payloads |
| `@nostr-wot/wallet/nwc` | Transport-injected NIP-47 client, connection parsing and payment outcomes |
| `@nostr-wot/ui` | Native login controls and their customization options |

Obelisk owns account state, routes, translation dictionaries, consent, storage lifecycle and branded UI. Its read-state service adapts the bridge signer to the SDK. Its wallet transport binds SDK requests to the appropriate relay identity. The existing persisted vault record format stays app-owned until a separate, compatible data migration is designed.

## Working locally

Read the SDK checkout's `AGENTS.md` and create a separate worktree. Extend existing package APIs before adding another implementation. Preserve protocol behavior and put its regression tests in the owning SDK package; keep application integration tests in Obelisk.

For pre-release consumer verification, build the changed SDK packages, verify `check:dist`, and pack them. Install those tarballs only into an isolated Obelisk worktree with its own `node_modules`. Do not replace the canonical checkout's dependency symlink or commit temporary tarball paths into the application lockfile.

## Publishing

Add changesets for the packages whose public behavior changes. The SDK release workflow versions packages, rebuilds them, checks types and tests, verifies the packed distribution, and publishes to npm. Merging code is not proof of publication: verify the workflow result and the exact registry versions before updating Obelisk.

Once published, install the registry versions in Obelisk and update its lockfile. Run the app integration tests and structural checks against those installed packages. Release-only production and browser checks remain governed by Obelisk's `AGENTS.md`.

## Login integration

The SDK constructs a signer and passes the pairing material through `onLogin`. Obelisk owns session restoration and uses memory-only SDK signer storage. Translation and same-device NIP-46 handoff customization belong in the SDK's native options rather than a MutationObserver that rewrites third-party markup.
