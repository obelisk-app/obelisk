/**
 * The bridge's reactive cell: a value, a listener set, and subscribe-with-
 * replay. Every `useXxx` hook under `hooks/` is a subscription to one of
 * these. `updatePending` is the shared patch helper for the optimistic
 * message maps (group messages and DMs) that key placeholders by
 * `clientTag`.
 */
import type { Unsubscribe } from './types';

export type Listener<T> = (value: T) => void;

export class StateStore<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (next === this.value) return;
    this.value = next;
    this.listeners.forEach((l) => l(next));
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(cb: Listener<T>): Unsubscribe {
    this.listeners.add(cb);
    cb(this.value);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export function updatePending<T extends { clientTag?: string }>(
  store: StateStore<Record<string, T[]>>,
  key: string,
  clientTag: string,
  patch: Partial<T> | null,
): void {
  store.update((prev) => {
    const existing = prev[key];
    if (!existing) return prev;
    if (patch === null) {
      const next = existing.filter((msg) => msg.clientTag !== clientTag);
      return next.length === existing.length ? prev : { ...prev, [key]: next };
    }
    let touched = false;
    const next = existing.map((msg) => {
      if (msg.clientTag !== clientTag) return msg;
      touched = true;
      return { ...msg, ...patch };
    });
    return touched ? { ...prev, [key]: next } : prev;
  });
}
