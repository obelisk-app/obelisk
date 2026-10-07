'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  bindKey, loadKeyMap, resetKeyMap, saveKeyMap, unbindKey, type BindableAction, type KeyMap,
} from '@/lib/games/stacker/keymap';
import { keyRows } from '@/utils/games/stacker/key-rows';

/**
 * The key-binding panel's view model. Bindings live in localStorage, per
 * browser: they belong to the keyboard in front of you, not to the account.
 * While an action is listening, the next keypress is taken in the capture
 * phase (so the game never sees it) and bound to that action; Escape stops
 * listening without binding anything.
 */
export function useStackerKeysPanel() {
  const t = useTranslations();
  const [map, setMap] = useState<KeyMap>(() => loadKeyMap());
  const [listening, setListening] = useState<BindableAction | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      const next = bindKey(map, e.code, listening);
      setMap(next);
      saveKeyMap(next);
      setListening(null);
    };
    // Capture, so the game's own handler does not also see this keypress.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, map]);

  const unbind = (code: string) => {
    const next = unbindKey(map, code);
    setMap(next);
    saveKeyMap(next);
  };

  return {
    rows: keyRows(map, listening, t('games.stacker.space')),
    listen: (action: BindableAction) => setListening(action),
    unbind,
    reset: () => setMap(resetKeyMap()),
  };
}
