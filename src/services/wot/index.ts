/**
 * Public surface for Web-of-Trust gating. Anything outside `src/services/wot/`
 * should import from here, never from the internal modules directly.
 */
export { isAllowed, wotEngine, type WotEngineConfig } from './engine';
export { useWotStore } from '@/store/wot';
export { initializeWot } from './initialize';
export type { WotStatus } from './extension';
