'use client';

import { useDismiss } from '@/hooks/useDismiss';

/**
 * Call `onEscape` when Escape is pressed while `enabled`.
 *
 * Superseded by `useDismiss` (`src/hooks/useDismiss.ts`), which every call
 * site in this folder now uses directly; this is a thin wrapper over it so
 * there is one Escape listener implementation, not two.
 */
export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useDismiss({ onDismiss: onEscape, enabled, outside: 'none' });
}
