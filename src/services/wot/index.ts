/**
 * Public surface for Web-of-Trust gating. Anything outside `src/services/wot/`
 * should import from here, never from the internal modules directly.
 */
export { isAllowed, wotEngine, type WotEngineConfig } from './engine';
export { useWotStore, initializeWot } from './store';
export type { WotStatus } from './extension';
