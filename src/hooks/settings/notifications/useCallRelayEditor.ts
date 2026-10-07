'use client';

import { useState } from 'react';
import { DEFAULT_CALL_RELAYS, normalizeCallRelays, setPreference } from '@/services/preferences/preferences';
import { callRelaysToSave } from '@/utils/settings/call-relays';

export type CallRelayStatus = 'idle' | 'saved' | 'invalid';

/**
 * The call relay list being edited. Seeded from the saved list; the parent
 * remounts the editor (`key`) whenever the saved list changes, so there is
 * nothing to re-sync. Every edit clears the status line.
 */
export function useCallRelayEditor(saved: readonly string[], onStatus: (s: CallRelayStatus) => void) {
  const [draft, setDraft] = useState<string[]>(() => [...saved]);

  const edit = (next: (current: string[]) => string[]) => {
    setDraft(next);
    onStatus('idle');
  };

  const save = () => {
    const relays = callRelaysToSave(draft);
    if (!relays) {
      onStatus('invalid');
      return;
    }
    setPreference('callRelays', normalizeCallRelays(relays));
    onStatus('saved');
  };

  return {
    draft,
    change: (i: number, value: string) => edit((cur) => cur.map((r, j) => (j === i ? value : r))),
    remove: (i: number) => edit((cur) => cur.filter((_, j) => j !== i)),
    add: () => edit((cur) => [...cur, '']),
    reset: () => edit(() => [...DEFAULT_CALL_RELAYS]),
    save,
  };
}
