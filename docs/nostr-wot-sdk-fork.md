# nostr-wot-sdk fork — local dev workflow

We work on the `@nostr-wot/ui` login modal (and friends) out of a local
clone of [`Fabricio333/nostr-wot-sdk`](https://github.com/Fabricio333/nostr-wot-sdk),
a fork of [`nostr-wot/nostr-wot-sdk`](https://github.com/nostr-wot/nostr-wot-sdk).
Push access on the org repo is read-only for us, so the fork is the
push target until changes land upstream.

## Layout (sibling to the obelisk repos)

```
WebstormProjects/
├── nostr-wot-sdk/                ← fork clone (its own git repo)
│   ├── packages/ui               ← login modal + widget + button
│   ├── packages/signers          ← NIP-07/46/55/PrivateKey backends
│   ├── packages/data             ← session context + data hooks
│   └── examples/login-playground ← Vite sandbox (added by this fork)
├── obelisk-dex/                  ← consumes via file:../nostr-wot-sdk/...
│   └── docs/nostr-wot-sdk-fork.md   (this file)
└── obelisk/                      ← (also consumes the same fork — same file: pattern)
```

The clone lives next to the obelisk repos, not inside them. Both
obelisk-dex and obelisk-classic point at the same checkout via
`file:../nostr-wot-sdk/packages/*`, so a single edit + rebuild flows
to every consumer.

## Where the login lives

| File | Role |
|------|------|
| `packages/ui/src/login/LoginButton.tsx` | Pill button → opens `LoginModal` |
| `packages/ui/src/login/LoginModal.tsx` | Portal wrapper around `LoginWidget` |
| `packages/ui/src/login/LoginWidget.tsx` | Picker + per-method dispatch + `onLogin` plumbing |
| `packages/ui/src/login/methods/Nip07Method.tsx` | Browser extension flow |
| `packages/ui/src/login/methods/Nip46Method.tsx` | Bunker (QR + paste URI) flow |
| `packages/ui/src/login/methods/GenerateMethod.tsx` | Create-new-keypair flow + optional kind-0 publish |
| `packages/ui/src/login/methods/ImportMethod.tsx` | Paste-nsec flow |
| `packages/ui/src/primitives/Modal.tsx` | Generic portal modal (ESC, scroll lock, backdrop) |
| `packages/ui/src/session-shell.tsx` | `<NostrSessionProvider>` + auto-restore wiring |
| `packages/ui/src/signer-storage*.ts(x)` | Pluggable persistence (default = localStorage) |
| `packages/ui/src/auth-handshake.ts` | Optional NIP-98 → JWT cookie flow (server-backed) |
| `packages/signers/src/{nip07,nip46,nip55,private-key}/index.ts` | The four `NostrSigner` backends |

The session is held in `<NostrSessionProvider>` (from `@nostr-wot/data/react`,
re-exported by `@nostr-wot/ui`). Every other `@nostr-wot/*` hook reads the
same context, so once login completes the signer is available app-wide.

## Sandbox: `examples/login-playground`

A Vite + React + TS app added under the fork. Boots in seconds, exercises
all four login methods, and aliases `@nostr-wot/*` imports to the package
sources so edits in `packages/ui/src/**` and `packages/signers/src/**`
hot-reload without a rebuild.

```bash
cd ../nostr-wot-sdk
npm install                                   # one-time, hoists workspace deps
npm run dev -w @nostr-wot/login-playground    # http://localhost:5173
```

Toggles in the playground:

- `methods` — pick which of `nip07 | nip46 | generate | import` render
- `nip46Mode` — `qr` (nostrconnect QR) vs `paste` (bunker:// URI)
- `hideAdvanced` — collapse / expose generate + import
- `profileSetup` — show kind-0 setup step after generate
- Inline `<LoginWidget>` rendered alongside the modal for comparison

The session panel reads `useSession()` and prints pubkey, signer
constructor name, and NIP-04 / NIP-44 capability flags.

## Sync flow

```bash
cd ../nostr-wot-sdk

# pull from upstream main
git fetch upstream
git checkout main
git merge upstream/main          # fast-forward; no conflicts on a clean fork
git push origin main

# work on a feature branch
git checkout -b login/<short-slug>
# ... edit packages/ui/src/login/** ...
git add -p && git commit
git push -u origin login/<short-slug>

# open PR back to nostr-wot/nostr-wot-sdk
gh pr create --repo nostr-wot/nostr-wot-sdk \
  --base main --head Fabricio333:login/<short-slug>
```

Branches stay on `Fabricio333/nostr-wot-sdk` until the org maintainers
merge — at which point `git pull upstream main` brings the merged
version back.

## Consuming the fork from obelisk-dex

`obelisk-dex/package.json` declares the three runtime packages as
`file:..` deps pointing at the sibling clone:

```json
"@nostr-wot/data":    "file:../nostr-wot-sdk/packages/data",
"@nostr-wot/signers": "file:../nostr-wot-sdk/packages/signers",
"@nostr-wot/ui":      "file:../nostr-wot-sdk/packages/ui"
```

npm 9+ symlinks (not copies) for `file:` deps, so rebuilds inside the
SDK propagate to obelisk's `node_modules/@nostr-wot/*` immediately —
no `npm install` needed after a rebuild.

```bash
cd ../nostr-wot-sdk
npm run build -w @nostr-wot/ui      # rebuild only what changed
# back in obelisk-dex: Next dev picks it up on next request
```

For tight inner-loop work, do iteration in the playground (instant HMR,
no rebuild), then rebuild only when ready to wire into the chat shell.

> **Status:** obelisk-dex's existing login (`src/app/app/LoginModal.tsx`)
> has **not** been migrated to `@nostr-wot/ui` yet. The deps are wired so
> the SDK is *available*; the cutover is its own task — see
> [Migration paths](#migration-paths) below.

## Consuming the fork from obelisk-classic (or any sibling)

Same pattern. From the consumer's `package.json`:

```json
"@nostr-wot/data":    "file:../nostr-wot-sdk/packages/data",
"@nostr-wot/signers": "file:../nostr-wot-sdk/packages/signers",
"@nostr-wot/ui":      "file:../nostr-wot-sdk/packages/ui"
```

Then `npm install`. The symlinks resolve to the same checkout, so a
single edit + rebuild updates every consumer.

If you need to ship the fork without expecting consumers to clone it
locally, the alternatives are:

1. **Git URL with a tarball proxy** (e.g. `gitpkg.now.sh`) — supports
   monorepo subpaths. Fragile but zero-publish.
2. **Publish under your own scope** (e.g. `@fabricio333/ui`) — most
   portable, requires npm publish access.

## Migration paths (for obelisk-dex / obelisk-classic)

The bridge (`src/lib/nostr-bridge/client.ts`) owns auth in obelisk-dex —
not React context. Three reasonable cutover strategies:

1. **UI-only swap, bridge stays.** Add `bridge.loginWithSigner(signer)`
   that accepts any `NostrSigner`, then replace the modal with
   `<LoginButton>` and forward the signer in `onLogin`.
2. **Side-by-side.** Mount the SDK login at `/dev/sdk-login` and write
   the resulting signer through a thin bridge adapter. A/B without
   touching the prod login.
3. **No migration yet.** Iterate in the playground, open the upstream
   PR when ready, come back to obelisk later.

## Cleanup if you're done with the fork

```bash
# Delete the local clone:
rm -rf ../nostr-wot-sdk
# Drop the file: deps from each consumer's package.json + npm install.
# Delete the fork on GitHub (irreversible):
gh repo delete Fabricio333/nostr-wot-sdk --yes
```
