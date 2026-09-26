/**
 * Test double for a relay carrying ephemeral kinds: it keeps nothing, and
 * forwards an event only to subscriptions that are live *at publish time*.
 * A subscription goes live `liveDelayMs` after the REQ (then EOSE fires), and
 * `drop` can lose any published event — the two things that made DM calls
 * connect "sometimes instantly, sometimes never".
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { CallPoolLike } from './signaling';

export interface FakeEphemeralRelay {
  pool: CallPoolLike;
  published: NostrEvent[];
  delivered: number;
}

export function fakeEphemeralRelay(opts: { liveDelayMs?: number; drop?: (ev: NostrEvent, n: number) => boolean } = {}): FakeEphemeralRelay {
  const subs: Array<{ filter: Filter; onevent: (ev: NostrEvent) => void; live: boolean }> = [];
  const state: FakeEphemeralRelay = { pool: null as unknown as CallPoolLike, published: [], delivered: 0 };
  const matches = (f: Filter, ev: NostrEvent) =>
    (!f.kinds || f.kinds.includes(ev.kind))
    && (!f['#p'] || ev.tags.some((t) => t[0] === 'p' && f['#p']!.includes(t[1])));
  state.pool = {
    subscribe(_relays, filter, params) {
      const sub = { filter, onevent: params.onevent, live: false };
      subs.push(sub);
      setTimeout(() => {
        sub.live = true;
        params.oneose?.();
      }, opts.liveDelayMs ?? 0);
      return { close: () => { const i = subs.indexOf(sub); if (i >= 0) subs.splice(i, 1); } };
    },
    publish(_relays, ev) {
      const n = state.published.length;
      state.published.push(ev);
      if (!opts.drop?.(ev, n)) {
        // Relay → subscriber hop is async, like a socket.
        queueMicrotask(() => {
          for (const s of [...subs]) {
            if (s.live && matches(s.filter, ev)) { state.delivered++; s.onevent(ev); }
          }
        });
      }
      return [Promise.resolve('ok')];
    },
  };
  return state;
}
