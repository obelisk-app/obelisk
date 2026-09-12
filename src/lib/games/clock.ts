'use client';

/**
 * A shared, boundary-aligned "now" in unix seconds.
 *
 * Every game card used to own its own `setInterval`. Ten cards meant ten
 * unaligned timers firing at ten different moments, so a single logical tick
 * produced ten separate React commits — each one re-deriving that card's table.
 * Here the timer is per *interval length*, not per subscriber: all ten cards
 * read the same value, updated once, in one batch.
 *
 * The first tick is aligned to the next multiple of the interval so that
 * subscribers which mount at different times still share a tick boundary —
 * otherwise "shared timer" would still mean staggered renders for anything
 * mounted late.
 */
import { useSyncExternalStore } from 'react';

interface Ticker {
  listeners: Set<() => void>;
  value: number;
  timer: ReturnType<typeof setTimeout> | null;
  interval: ReturnType<typeof setInterval> | null;
}

const tickers = new Map<number, Ticker>();

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function tickerFor(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { listeners: new Set(), value: nowSeconds(), timer: null, interval: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

function advance(t: Ticker): void {
  const next = nowSeconds();
  if (next === t.value) return;
  t.value = next;
  for (const l of t.listeners) l();
}

function start(t: Ticker, intervalMs: number): void {
  const delay = intervalMs - (Date.now() % intervalMs);
  t.timer = setTimeout(() => {
    t.timer = null;
    advance(t);
    t.interval = setInterval(() => advance(t), intervalMs);
  }, delay);
}

function stop(t: Ticker): void {
  if (t.timer !== null) {
    clearTimeout(t.timer);
    t.timer = null;
  }
  if (t.interval !== null) {
    clearInterval(t.interval);
    t.interval = null;
  }
}

/**
 * A ticking "now" in unix seconds, shared by every caller passing the same
 * interval. Drives the turn clock without a re-derive storm.
 */
export function useNowSeconds(intervalMs = 1000): number {
  const [subscribe, getSnapshot] = pair(intervalMs);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Stable `subscribe`/`getSnapshot` per interval. `useSyncExternalStore`
 * resubscribes whenever `subscribe` changes identity, so these are cached
 * rather than built per render.
 */
const pairs = new Map<number, [(cb: () => void) => () => void, () => number]>();

function pair(intervalMs: number): [(cb: () => void) => () => void, () => number] {
  let p = pairs.get(intervalMs);
  if (!p) {
    p = [
      (cb: () => void) => {
        const t = tickerFor(intervalMs);
        // First subscriber starts the timer; the last one out turns it off, so
        // a tab with no game surface open is not waking up on a clock.
        if (t.listeners.size === 0) {
          t.value = nowSeconds();
          start(t, intervalMs);
        }
        t.listeners.add(cb);
        return () => {
          t.listeners.delete(cb);
          if (t.listeners.size === 0) stop(t);
        };
      },
      () => tickerFor(intervalMs).value,
    ];
    pairs.set(intervalMs, p);
  }
  return p;
}

/** Test seam: drop every ticker and its timer. */
export function __resetGameClocks(): void {
  for (const t of tickers.values()) stop(t);
  tickers.clear();
}
