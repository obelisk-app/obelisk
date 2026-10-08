# Obelisk documentation

Start with [repository setup](../README.md#run-locally) and [AGENTS.md](../AGENTS.md) for the working rules. Current implementation references are organized by responsibility; proposals and historical records are separate so old plans do not become accidental instructions.

| Need | Start here |
|---|---|
| Understand routes, providers and data ownership | [Architecture](architecture/README.md) |
| Build or simplify UI consistently | [UI and interaction](ui/README.md) |
| Build, deploy, test or triage an issue | [Operations](operations/README.md) |
| Work on a feature or protocol integration | [Feature references](features/README.md) |
| Evaluate a future design | [Proposals](proposals/README.md) and [ROADMAP](../ROADMAP.md) |
| Trace an earlier decision or measurement | [History](history/README.md) |

## Frequently used references

- [Code conventions](ui/conventions.md): layer ownership, cohesive screens, shared Link/List/Text and other UI primitives.
- [App shell ownership](architecture/app-shells.md): desktop/phone responsibilities, shared behavior and loading boundaries.
- [Rendering and CSP](architecture/static-public-pages.md): immutable public artifacts, dynamic nonces and deployment verification.
- [Internationalization](architecture/i18n.md): locale URLs, page-owned scopes, translation payloads and SEO.
- [Data system](architecture/data-system.md): login, relay access, caches, loading priorities and local storage.
- [Read state](architecture/read-state.md): read cursors, mentions and encrypted synchronization.
- [Voice](features/voice/README.md), [DMs](features/direct-messages.md), [social feeds](features/social-feeds.md) and [payments](features/bitcoin-zaps-nwc.md).
- [Client issues](operations/known-bugs.md) and [SFU issues](operations/sfu-known-bugs.md).

## Keeping these docs current

Update the current reference with a behavior or ownership change and link to it rather than copying a second contract. Keep dated measurements in history and mark their superseded conclusions explicitly. A proposed capability remains a proposal until verified in its owning codebase. Use repository-relative source paths in prose and working relative Markdown links between documents.

Run `python3 scripts/docs/check-links.py` after moving documentation. It checks local Markdown link targets and anchors, plus exact references to moved documentation paths throughout tracked text. This checks navigation and references, not protocol correctness or the accuracy of every historical claim.
