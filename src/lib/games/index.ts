/**
 * Turn-based games played as Nostr events in a channel: the shared contract
 * (`core/`), the wire protocol (`protocol/`), the deterministic replay of a
 * table's log (`session/`) and one folder per rules engine
 * (`chain-reaction/`, `stacker/`, `vesta/`).
 *
 * This is the package's entry. App code imports the module it needs
 * (`@/lib/games/session/session`, `@/lib/games/core/catalog`, ...) so each
 * engine stays its own download: `core/registry.ts` fetches an engine the
 * first time a table of that game is replayed, and this entry does not
 * re-export the engines.
 */
export * from './core/types';
export * from './core/game-meta';
export * from './core/catalog';
export * from './core/registry';
export * from './core/seat-label';
export * from './core/standings';
export * from './core/clock';
export * from './protocol/protocol';
export * from './session/session';
