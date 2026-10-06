/**
 * The hub's publish path. One result per distinct relay, in spec order.
 * Every relay is isolated: an invalid URL, an exhausted socket budget, a
 * dead socket or a slow OK each produce that relay's own `unreachable` /
 * `timeout` row and never reject the array or delay the others past their
 * own `ackTimeoutMs`. `spec.onResult` fires per relay as each settles, so a
 * UI can paint the fast relays while a dead one is still timing out.
 */
import type { Identity, PublishResult, PublishSpec } from './types';
import { AUTH_UNAVAILABLE } from './types';
import type { AuthLayer } from './auth';
import type { SocketEntry, SocketTable } from './sockets';
import { normalizeURL } from './canonical';
import { errorMessage, isEphemeralKind } from './env';

const EPHEMERAL_ACK_MS = 750;
const DEFAULT_ACK_MS = 4000;
const TIMEOUT_MARKER = 'hub: publish ack timed out';

export interface PublishDeps {
  readonly sockets: SocketTable;
  readonly auth: AuthLayer;
}

export async function publishToRelays(deps: PublishDeps, spec: PublishSpec, identity: Identity): Promise<readonly PublishResult[]> {
  const seen = new Set<string>();
  const tasks: Promise<PublishResult>[] = [];
  for (const raw of spec.relays) {
    let url: string;
    try {
      url = normalizeURL(raw);
    } catch (err) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      tasks.push(Promise.resolve<PublishResult>({ url: raw, status: 'unreachable', reason: errorMessage(err) }));
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    tasks.push(publishOne(deps, url, spec, identity));
  }
  if (!spec.onResult) return Promise.all(tasks);
  const report = spec.onResult;
  return Promise.all(
    tasks.map((task) =>
      task.then((result) => {
        report(result);
        return result;
      }),
    ),
  );
}

async function publishOne(deps: PublishDeps, url: string, spec: PublishSpec, identity: Identity): Promise<PublishResult> {
  let entry: SocketEntry;
  try {
    entry = deps.sockets.ensure(url, identity);
  } catch (err) {
    return { url, status: 'unreachable', reason: errorMessage(err) };
  }
  entry.busy += 1;
  const ephemeral = isEphemeralKind(spec.event.kind);
  const ackMs = spec.ackTimeoutMs ?? (ephemeral ? EPHEMERAL_ACK_MS : DEFAULT_ACK_MS);
  try {
    try {
      await deps.sockets.whenConnected(entry, ackMs);
    } catch (err) {
      return { url, status: 'unreachable', reason: errorMessage(err) };
    }
    const attempt = () => withTimeout(entry.relay.publish(spec.event), ackMs);
    const authMode = spec.authMode ?? 'policy';
    if (authMode === 'auth-first' && !(entry.relay.onauth && (await awaitAuth(deps.auth, entry)))) {
      return { url, status: 'rejected', reason: AUTH_UNAVAILABLE };
    }
    try {
      const reason = await attempt();
      return { url, status: 'ok', reason: reason || null };
    } catch (err) {
      const message = errorMessage(err);
      if (message === TIMEOUT_MARKER) {
        // An ephemeral kind is fire-and-forget; many relays never OK it.
        return ephemeral ? { url, status: 'ok', reason: 'no ack (ephemeral kind)' } : { url, status: 'timeout', reason: null };
      }
      if (message.startsWith('auth-required:') && authMode === 'policy' && entry.relay.onauth) {
        const ok = await awaitAuth(deps.auth, entry);
        if (ok) {
          try {
            const reason = await attempt();
            return { url, status: 'ok', reason: reason || null };
          } catch (err2) {
            const m2 = errorMessage(err2);
            return m2 === TIMEOUT_MARKER ? { url, status: 'timeout', reason: null } : { url, status: 'rejected', reason: m2 };
          }
        }
      }
      return { url, status: 'rejected', reason: message };
    }
  } finally {
    entry.busy = Math.max(0, entry.busy - 1);
  }
}

/** Ride the AUTH already in flight on this socket, or start one if the relay has challenged us. */
async function awaitAuth(auth: AuthLayer, entry: SocketEntry): Promise<boolean> {
  const record = auth.recordFor(entry);
  if (record?.state === 'refused') return false;
  if (record?.state === 'authenticated' && record.socketGeneration === entry.generation) return true;
  if (record?.verdict && (record.state === 'signing' || record.state === 'challenged')) return record.verdict;
  const signer = entry.relay.onauth;
  if (!signer) return false;
  try {
    await entry.relay.auth(signer);
    return true;
  } catch {
    return false;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT_MARKER)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
