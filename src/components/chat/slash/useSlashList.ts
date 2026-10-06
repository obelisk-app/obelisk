'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { SlashCommand } from './slash-commands';

/**
 * Stable row callbacks and keyboard-follow scrolling for the command list.
 * `select` and `registerRef` never change identity, so memoised rows only
 * re-render when their own props change (selection moves two rows, not the
 * whole list); the selected row is scrolled into view as it moves.
 */
export function useSlashList(onSelect: (cmd: SlashCommand) => void, selectedIndex: number) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; });
  const select = useCallback((cmd: SlashCommand) => onSelectRef.current(cmd), []);
  const registerRef = useCallback((i: number, el: HTMLButtonElement | null) => { itemRefs.current[i] = el; }, []);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return { select, registerRef };
}
