/**
 * Prioritized signer work: extension requests are serialized; bunker RPCs
 * use bounded concurrency, with only one background request at a time.
 * Interactive work is selected before queued background work. Starting
 * order is FIFO within each transport/lane; results may settle out of order.
 * Reset generations prevent an old completion releasing a new session slot.
 */

import { CodedError } from '@/utils/errors/codes';
import { pushRelayDebug } from '../relay/relay-debug';
import { MAX_IN_FLIGHT, BUNKER_MAX_IN_FLIGHT, BUNKER_BACKGROUND_MAX_IN_FLIGHT } from '@/constants/nostr-bridge/session';

type SignerTransport = 'extension' | 'bunker';

export type SignerLane = 'interactive' | 'background';

interface QueueEntry {
  readonly lane: SignerLane;
  readonly transport: SignerTransport;
  readonly label: string;
  readonly run: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  /** Start-deadline timer, cleared the moment the entry takes the slot. */
  deadline?: ReturnType<typeof setTimeout>;
}

/**
 * The op was still waiting for the signer when its start deadline passed.
 * It never reached the signer, so nothing was signed.
 */
export class SignerQueueTimeoutError extends CodedError {
  constructor(label: string, ms: number) {
    super('signer-timeout', `Signer queue: ${label} did not start within ${ms} ms`); // i18n-exempt: developer message; readers get the code
    this.name = 'SignerQueueTimeoutError';
  }
}

const lanes: Record<SignerLane, QueueEntry[]> = {
  interactive: [],
  background: [],
};

let generation = 0;
let inFlight: Record<SignerTransport, number> = { extension: 0, bunker: 0 };
let bunkerBackground = 0;

export interface SignerQueueStats {
  interactive: number;
  background: number;
  inFlight: number;
}

export function signerQueueStats(): SignerQueueStats {
  return {
    interactive: lanes.interactive.length,
    background: lanes.background.length,
    inFlight: inFlight.extension + inFlight.bunker,
  };
}

function nextEntry(): QueueEntry | undefined {
  const available = (entry: QueueEntry) => entry.transport === 'extension'
    ? inFlight.extension < MAX_IN_FLIGHT
    : inFlight.bunker < BUNKER_MAX_IN_FLIGHT
      && (entry.lane === 'interactive' || bunkerBackground < BUNKER_BACKGROUND_MAX_IN_FLIGHT);
  for (const lane of [lanes.interactive, lanes.background]) {
    const index = lane.findIndex(available);
    if (index >= 0) return lane.splice(index, 1)[0];
  }
}

function drain(): void {
  for (let entry = nextEntry(); entry; entry = nextEntry()) {
    const active = entry;
    const startedGeneration = generation;
    if (active.deadline) clearTimeout(active.deadline);
    inFlight[active.transport] += 1;
    const background = active.transport === 'bunker' && active.lane === 'background';
    if (background) bunkerBackground += 1;
    void Promise.resolve()
      .then(() => {
        if (generation !== startedGeneration) throw new CodedError('signer-reset', 'Signer queue reset');
        return active.run();
      })
      .then(active.resolve, active.reject)
      .finally(() => {
        // Already-started requests cannot be recalled, but their completion
        // must not reduce the new account's counters or exceed its limits.
        if (generation !== startedGeneration) return;
        inFlight[active.transport] -= 1;
        if (background) bunkerBackground -= 1;
        drain();
      });
  }
}

/**
 * Queue a signer operation. Interactive work jumps ahead of any background
 * backlog; within a lane, order is preserved.
 *
 * `label` is for diagnostics only (relay-debug panel, `window.__obeliskSignerQueue`).
 *
 * `startDeadlineMs`: reject with {@link SignerQueueTimeoutError} if the op is
 * still queued after this long. For signatures that are worthless late (a
 * voice SDP answer the peer stopped waiting for), so they don't occupy the
 * signer ahead of fresher work. An op that already started runs to the end:
 * a request handed to the extension cannot be recalled.
 */
export function enqueueSignerOp<T>(
  lane: SignerLane,
  label: string,
  run: () => Promise<T>,
  opts?: { startDeadlineMs?: number; transport?: SignerTransport },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry = {
      lane,
      transport: opts?.transport ?? 'extension',
      label,
      run: run as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    };
    const ms = opts?.startDeadlineMs;
    if (ms !== undefined) {
      entry.deadline = setTimeout(() => {
        const queue = lanes[lane];
        const i = queue.indexOf(entry);
        if (i < 0) return;
        queue.splice(i, 1);
        pushRelayDebug({ kind: 'signer-queue', status: `${label} · dropped after ${ms} ms queued` });
        reject(new SignerQueueTimeoutError(label, ms));
      }, ms);
    }
    lanes[lane].push(entry);
    const stats = signerQueueStats();
    // Only surface a depth that means something: a queue that is keeping up
    // shouldn't spam the debug panel on every keystroke.
    if (stats.interactive + stats.background > 1) {
      pushRelayDebug({
        kind: 'signer-queue',
        status: `${label} · ${stats.interactive}i/${stats.background}b`,
      });
    }
    drain();
  });
}

/**
 * Drop every queued operation and reset the in-flight counter. Called on
 * logout / session change: the queued closures capture the old session's
 * signer, and running them against a new identity would be wrong.
 *
 * Pending callers are rejected rather than left hanging so their `await`s
 * unwind instead of leaking.
 */
export function resetSignerQueue(): void {
  const pending = [...lanes.interactive, ...lanes.background];
  lanes.interactive = [];
  lanes.background = [];
  generation += 1;
  inFlight = { extension: 0, bunker: 0 };
  bunkerBackground = 0;
  for (const entry of pending) {
    if (entry.deadline) clearTimeout(entry.deadline);
    try {
      entry.reject(new CodedError('signer-reset', 'Signer queue reset'));
    } catch {
      // A rejection handler that throws must not stop us clearing the rest.
    }
  }
}

/**
 * Expose stats for manual inspection: `window.__obeliskSignerQueue.stats()`.
 * Mirrors the `window.wot = wotEngine` precedent in `src/services/wot/initialize.ts`.
 */
export function installSignerQueueDebug(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __obeliskSignerQueue?: unknown }).__obeliskSignerQueue = {
    stats: signerQueueStats,
  };
}
