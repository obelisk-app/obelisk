import type { BridgeImpl } from '@/services/nostr-bridge';
import type { SessionActions } from '@/types/session/session';
import { CodedError } from '@/utils/errors/codes';

// Invalidate a deferred login before its lazy module has even loaded.
const intents = new WeakMap<BridgeImpl, number>();
function nextIntent(bridge: BridgeImpl): number {
  const intent = (intents.get(bridge) ?? 0) + 1;
  intents.set(bridge, intent);
  return intent;
}

function requireBridge(bridge: BridgeImpl | null): BridgeImpl {
  if (!bridge) throw new CodedError('not-logged-in', 'Session is not ready');
  return bridge;
}

/** Stable app commands over the bridge's single credential owner. Heavy flows load on demand. */
export function createSessionActions(current: BridgeImpl | null): SessionActions {
  return {
    async login(args) {
      const bridge = requireBridge(current);
      const intent = nextIntent(bridge);
      const generation = bridge.getSessionGeneration();
      const { routeToBridge } = await import('./login');
      if (intents.get(bridge) !== intent || bridge.getSessionGeneration() !== generation) {
        throw new DOMException('Login was superseded', 'AbortError');
      }
      const pending = routeToBridge(bridge, args);
      const startedGeneration = bridge.getSessionGeneration();
      await pending;
      if (intents.get(bridge) !== intent || bridge.getSessionGeneration() !== startedGeneration) throw new DOMException('Login was superseded', 'AbortError');
    },
    async logout() {
      const bridge = requireBridge(current);
      nextIntent(bridge);
      await bridge.logout();
    },
    async updateProfile(values, onUploading) {
      const bridge = requireBridge(current);
      const generation = bridge.getSessionGeneration();
      const { updateSessionProfile } = await import('./profile');
      if (bridge.getSessionGeneration() !== generation) throw new CodedError('signer-reset', 'Session changed');
      await updateSessionProfile(bridge, values, onUploading);
    },
    async publishGeneratedProfile(nsec, draft) {
      const { publishGeneratedProfile } = await import('./login');
      await publishGeneratedProfile(nsec, draft);
    },
  };
}

/** Lazy entry for bridge-free marketing and non-React account removal. */
export async function logoutSession(): Promise<void> {
  const { getBridgeImpl, logoutPageSession } = await import('@/services/nostr-bridge');
  const bridge = getBridgeImpl();
  if (bridge) nextIntent(bridge);
  await logoutPageSession();
}
