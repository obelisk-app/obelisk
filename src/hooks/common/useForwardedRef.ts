'use client';

import { useCallback, useRef, type Ref } from 'react';

/** Hand `node` to a ref, whether it is a callback or an object ref. */
function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === 'function') return ref(node);
  else if (ref) ref.current = node;
}

/**
 * A primitive's own handle on its element (to refocus or measure it) plus
 * the one ref callback that also feeds the caller's forwarded ref.
 */
export function useForwardedRef<T>(forwarded: Ref<T> | undefined) {
  const own = useRef<T | null>(null);
  const setRef = useCallback((node: T | null) => {
    own.current = node;
    const cleanup = assignRef(forwarded, node);
    if (node === null) return;
    return () => {
      own.current = null;
      if (typeof cleanup === 'function') cleanup();
      else assignRef(forwarded, null);
    };
  }, [forwarded]);
  return { own, setRef };
}
