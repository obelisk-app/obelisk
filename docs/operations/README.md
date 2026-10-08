# Operations and development

For repository setup and commands, start with [README](../../README.md#run-locally) and [AGENTS.md](../../AGENTS.md#commands). The commands and deployment permissions in AGENTS.md remain authoritative.

## Build and serve a consistent deployment

Run `npm run build`, then start that completed build with `npm start` or the existing process-manager workflow. The build command includes the static CSP generator; running only `next build` omits a required artifact. Ship public HTML, JavaScript, `.next/BUILD_ID` and `.next/server/static-csp.json` from the same build. A missing or stale security manifest produces a non-cacheable 503 for proxied production requests.

Public documents are immutable Next build artifacts, not indefinitely fresh browser documents. HTML revalidates so a later deployment can replace the shell; content-hashed assets remain immutable. Dynamic app, voice and viewer documents retain request-specific nonces and no-store response policy. Reverse proxies must preserve these distinctions, and must not rewrite inline script text after hashes are generated. See [rendering and CSP](../architecture/static-public-pages.md) for the route contract and verification procedure.

Production deployment requires the user's explicit request. `npm run deploy` targets the production process in `/root/obelisk-dex`. Test deployment uses the existing `/root/obelisk-dex-test` directory and process on port 3002; preserve its environment and dependency link. Do not create disposable test-release directories or substitute a new deployment procedure for the established one.

## Find the right reference

| Task | Reference |
|---|---|
| Expose local development over HTTPS | [Cloudflare tunnel](cloudflare-tunnel.md) |
| Develop and release shared Nostr packages | [Nostr WoT SDK](nostr-wot-sdk.md) |
| Export a Discord emoji set | [Emoji export](discord-emoji-export.md) |
| Triage client issues and debt | [Known bugs](known-bugs.md) |
| Triage SFU server issues | [SFU known bugs](sfu-known-bugs.md) |
| Exercise current voice behavior | [Voice testing](../features/voice/testing.md) |
| Understand older quota investigations | [Historical QA](../history/qa/voice-relay-quota-regression.md) |

Issue lists record reported or planned work and are not proof that every entry reproduces on the current build. Reproduce an issue before changing runtime behavior. Dated QA scripts and audits retain their original scope and results; use current subsystem references before following their old implementation assumptions.
