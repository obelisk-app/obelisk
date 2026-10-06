'use client';

import { useState } from 'react';

/**
 * `value` as it was when `key` last changed: the same reference for as long
 * as the key stays the same, however often the caller builds a fresh one.
 *
 * For an array or object whose identity changes every render but whose
 * meaning is captured by a key (a relay list joined, a follow list's
 * fingerprint), so it can sit in a dependency list without re-running the
 * effect on every render, and without an `eslint-disable` on a computed
 * dependency.
 */
export function useKeyedValue<T>(value: T, key: string): T {
  const [held, setHeld] = useState({ key, value });
  if (held.key !== key) {
    setHeld({ key, value });
    return value;
  }
  return held.value;
}
