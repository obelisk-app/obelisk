/**
 * `queryRelaysWithConfidence(..., { deadRelaysAnswerEmpty: true })`: a relay
 * that refused the REQ or whose socket never came up counts as an empty
 * answer, so a write-guarding read (the own profile's read-before-edit) is
 * not held hostage by a relay that is down. Without the option, `complete`
 * keeps the hub's meaning: every relay sent EOSE.
 */
import { describe, expect, it, vi } from 'vitest';
import type { QueryRelayOutcome, QueryResult, RelayHub, RelayStatus } from '@nostr-wot/relay/hub';
import { RequestsModule } from '@/services/nostr-bridge/subscriptions/registry';
import { StateStore } from '@/services/nostr-bridge/common/state-store';

const A = 'wss://a.example/';
const B = 'wss://b.example/';
const C = 'wss://c.example/';
const FILTER = { kinds: [0], authors: ['ab'.repeat(32)] };

type Socket = Pick<RelayStatus, 'connection' | 'lastError'>;

function requests(perRelay: Record<string, QueryRelayOutcome>, sockets: Record<string, Socket> = {}) {
  const hub = {
    subscribe: vi.fn(),
    acquireAuthLease: vi.fn(),
    disconnect: vi.fn(),
    query: vi.fn(async (): Promise<QueryResult> => ({
      events: [],
      complete: Object.values(perRelay).every((o) => o === 'eose'),
      fromCache: false,
      perRelay,
    })),
    status: vi.fn((url: string) => ({ url, ...(sockets[url] ?? { connection: 'connected', lastError: null }) }) as RelayStatus),
  } as unknown as Pick<RelayHub, 'subscribe' | 'query' | 'acquireAuthLease' | 'disconnect' | 'status'>;
  const reqs = new RequestsModule({
    hub,
    relays: () => [A],
    watched: { hub, signerOffered: () => true, setRelayAccess: () => undefined, setRelayAccessDeferred: () => undefined },
    connectionState: new StateStore('Connected'),
    activeSocketUp: () => true,
  });
  const read = (opts?: { deadRelaysAnswerEmpty?: boolean }) =>
    reqs.queryRelaysWithConfidence(Object.keys(perRelay), FILTER, 3500, { cache: 'bypass', ...opts }).then((r) => r.complete);
  return { read };
}

const DOWN: Socket = { connection: 'reconnecting', lastError: 'Unexpected server response: 502' };

describe('queryRelaysWithConfidence and relays that are down', () => {
  it('keeps the strict meaning by default: an unreachable or refusing relay leaves the answer uncertain', async () => {
    expect(await requests({ [A]: 'eose', [B]: 'unreachable' }).read()).toBe(false);
    expect(await requests({ [A]: 'eose', [B]: 'closed' }).read()).toBe(false);
  });

  it('with the option, counts unreachable and CLOSED relays as answered with nothing', async () => {
    expect(await requests({ [A]: 'eose', [B]: 'unreachable', [C]: 'closed' }).read({ deadRelaysAnswerEmpty: true })).toBe(true);
  });

  it('counts a relay the hub kept retrying through the whole wait as down', async () => {
    // The hub reports `timeout` for it: a socket other REQs want is retried,
    // so the query's wait never fails early.
    expect(await requests({ [A]: 'eose', [B]: 'timeout' }, { [B]: DOWN }).read({ deadRelaysAnswerEmpty: true })).toBe(true);
  });

  it('keeps the guard for a relay that was up and went quiet', async () => {
    expect(await requests({ [A]: 'eose', [B]: 'timeout' }).read({ deadRelaysAnswerEmpty: true })).toBe(false);
  });

  it('keeps the guard for a first handshake still in progress', async () => {
    const slow: Socket = { connection: 'connecting', lastError: null };
    expect(await requests({ [A]: 'eose', [B]: 'timeout' }, { [B]: slow }).read({ deadRelaysAnswerEmpty: true })).toBe(false);
  });

  it('needs at least one relay to have answered EOSE', async () => {
    expect(await requests({ [A]: 'unreachable', [B]: 'closed' }).read({ deadRelaysAnswerEmpty: true })).toBe(false);
  });
});
