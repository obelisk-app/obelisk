'use client';

import { useCallback, useRef, type Ref } from 'react';
import { mergeRefs } from '@/components/ui/forms/merge-refs';

/**
 * A primitive's own handle on its element (to refocus or measure it) plus
 * the one ref callback that also feeds the caller's forwarded ref.
 */
export function useForwardedRef<T>(forwarded: Ref<T> | undefined) {
  const own = useRef<T | null>(null);
  const setRef = useCallback((node: T | null) => mergeRefs(forwarded, own)(node), [forwarded]);
  return { own, setRef };
}
