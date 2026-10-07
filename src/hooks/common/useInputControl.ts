'use client';

import { useState, type Ref } from 'react';
import { useForwardedRef } from '@/hooks/common/useForwardedRef';
import type { InputClear } from '@/components/ui/forms/InputEnd';

/**
 * The Input primitive's view model: its own ref beside the caller's, the
 * secret field's shown/hidden state, and a clear that hands focus back to
 * the field.
 */
export function useInputControl(ref: Ref<HTMLInputElement> | undefined, clear: InputClear | undefined) {
  const { own, setRef } = useForwardedRef(ref);
  const [revealed, setRevealed] = useState(false);
  const onClear = () => {
    clear?.onClear();
    own.current?.focus();
  };
  return {
    setRef,
    revealed,
    toggleReveal: () => setRevealed((v) => !v),
    onClear,
  };
}
