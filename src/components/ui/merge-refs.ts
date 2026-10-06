import type { Ref, RefCallback } from 'react';

/**
 * One ref callback that feeds several refs, for a primitive that needs its
 * own handle on the element (to refocus it, or to measure it) while still
 * forwarding the caller's ref.
 */
export function mergeRefs<T>(...refs: ReadonlyArray<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }
  };
}
