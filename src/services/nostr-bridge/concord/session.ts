import { accountDataRelays } from '../account-data/relays';
import type { BridgeImpl } from '../facade/client';
import { pageRelayHub } from '../facade/page-hub';
import { openConcordStorage } from './storage';
import { cachedConcordAccountRelays } from './account-relays';
import type { createConcordRuntime } from './runtime';

type Runtime = Awaited<ReturnType<typeof createConcordRuntime>>;
interface Entry { generation: number; promise: Promise<Runtime>; dispose: () => void }
const sessions = new WeakMap<BridgeImpl, Entry>();

/** Lazy, explicit unlock. Session invalidation disposes SDK stores and hub identities. */
export function getConcordForBridge(bridge: BridgeImpl): Promise<Runtime> {
  const generation = bridge.getSessionGeneration();
  const prior = sessions.get(bridge);
  if (prior?.generation === generation) return prior.promise;
  prior?.dispose();
  const signer = bridge.getNipSigner();
  if (!signer) return Promise.reject(new Error('No active signer'));
  const guard = bridge.captureSessionGuard();
  let closed = false;
  let runtime: Runtime | undefined;
  let unsubscribe = () => {};
  const dispose = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    runtime?.dispose();
    if (sessions.get(bridge)?.generation === generation) sessions.delete(bridge);
  };
  const assertCurrent = () => {
    guard();
    if (closed) throw new DOMException('Concord session ended', 'AbortError');
  };
  const promise = Promise.all([import('./runtime'), openConcordStorage(signer.pubkey, assertCurrent)]).then(async ([module, storage]) => {
    await storage.applyRestore();
    const personalRelays = await cachedConcordAccountRelays(storage, () => accountDataRelays(bridge));
    assertCurrent();
    return module.createConcordRuntime(pageRelayHub(), signer, generation, assertCurrent, personalRelays, storage);
  }).then(value => {
    if (closed) { value.dispose(); throw new DOMException('Concord session ended', 'AbortError'); }
    runtime = value;
    return value;
  }).catch(error => { dispose(); throw error; });
  sessions.set(bridge, { generation, promise, dispose });
  unsubscribe = bridge.subscribeIsLoggedIn(loggedIn => { if (!loggedIn) dispose(); });
  return promise;
}
