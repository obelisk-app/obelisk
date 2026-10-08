# Historical documentation

This material records past decisions, investigations and verification at a particular point in time. It is retained for context, not as current implementation guidance. Follow [architecture](../architecture/README.md), [UI conventions](../ui/conventions.md) and [operations](../operations/README.md) when changing the current app.

## Audits

- [App shell audit](audits/2026-10-08-app-shells.md): responsive boundaries, shared lifecycle and UI, navigation continuity and lazy loading.

- [Clean code and modularity](audits/2026-10-08-clean-code.md): wrapper removal, layer separation and asynchronous state ownership.
- [Shared UI standardization](audits/2026-10-08-ui-standardization.md): primitive adoption at that pass.
- [Further audit](audits/2026-10-08-further-audit.md): follow-up checks and remaining limits.
- [UI efficiency](audits/2026-10-08-ui-efficiency.md): translation and responsive-shell investigation; later page ownership supersedes its layout-only scope guidance.
- [Page payloads](audits/2026-10-08-page-payloads.md): measured dictionary changes; later static-public rendering supersedes its initial nonce-only caching decision.
- [September voice mesh fixes](audits/2026-09-26-voice-mesh.md): dated failure analysis and fixes.

## Plans, specifications and retained evidence

- [Original i18n plan](plans/i18n-plan.md), superseded by [current i18n](../architecture/i18n.md).
- [WoT integration plan](plans/wot-integration-plan.md), retained after the filtering implementation moved into `src/services/wot/` and `src/store/wot/`.
- [Classic content migration](plans/content-migration-plan.md), which targets the retired Postgres stack.
- [DM design](specs/2026-04-26-direct-messages-design.md) and [implementation plan](plans/2026-04-26-direct-messages.md).
- [NIP-17 design](specs/2026-08-16-nip17-dms-design.md).
- [Post-quantum DM design](specs/2026-08-15-post-quantum-dms-design.md) and [implementation plan](plans/2026-08-15-post-quantum-dms.md).
- [Client-side wallet design](specs/2026-04-26-wallet-client-side-design.md).
- [Relay quota QA](qa/voice-relay-quota-regression.md), written before RelayHub; use [current voice testing](../features/voice/testing.md) for today's harness.
- [Archived screenshots](screenshots/README.md), retained assets rather than current UI evidence.

Test counts, byte measurements, file names and release constraints in these records describe their original pass. A later successful build or architectural change does not retroactively change that evidence. Supersession notes identify the current reference without rewriting the original results.
