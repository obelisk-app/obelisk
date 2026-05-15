/**
 * Public surface for the read-state system. Components and shells import
 * from this barrel so individual files can be rearranged without rippling
 * import paths through the app.
 *
 * What lives here:
 *   - Cursors (zustand store)            → `src/store/read-state.ts` is the
 *     canonical store; selectors re-exported via this barrel.
 *   - Selectors                          → `./selectors`
 *   - Reply detection (NIP-10 strict)    → `./replies`
 *   - Encrypted multi-device sync        → `./relay-sync`
 *   - Mount point (auto-mark + favicon)  → `./root` (default export)
 *
 * Read `docs/read-state.md` for the full architecture.
 */

export * from './selectors';
export * from './replies';
export { startGroupsRelaySync, startDMRelaySync } from './relay-sync';
export { default as ReadStateRoot, useReadyToSync } from './root';
