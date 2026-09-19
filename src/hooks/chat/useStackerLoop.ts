'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { STACKER_KEYS, type StackerStats, type StackerSoundEvent } from '@/lib/games/stacker/runner';
import { acquireRun, releaseRun, setRunCallbacks } from '@/lib/games/stacker/run-registry';
import { loadKeyMap, type KeyMap } from '@/lib/games/stacker/keymap';
import type { AttackEvent } from '@/lib/games/stacker/match';
import {
  ensureAudio, loadPrefs, playClear, playSfx, savePrefs, setMuted,
  startMusic, stopMusic, setMusicIntensity, type AudioPrefs,
} from '@/lib/games/stacker/audio';

export { STACKER_KEYS };

/**
 * Owns one `StackerRunner` and wires it to the browser: keyboard in, sound
 * out, stats into React.
 *
 * React only ever sees `stats`, which updates a few times a second. The board
 * itself subscribes to the runner directly and draws without re-rendering
 * anything — see `StackerBoard`.
 */
export function useStackerLoop(opts: {
  seed: number;
  /**
   * Identity of this player's run, stable across closing and reopening the
   * table. The run is kept in `run-registry` under this key so minimising the
   * modal suspends the match instead of destroying it.
   */
  matchKey: string;
  /** True once the match is decided — the run is then dropped rather than kept. */
  matchOver: boolean;
  incoming: readonly AttackEvent[];
  enabled: boolean;
  onAttack: (lines: number, hole: number, nonce: number) => void;
  onCheckpoint: (payload: {
    frame: number;
    attacksSent: number;
    linesCleared: number;
    stackHeight: number;
    inputs?: string;
    board: string;
  }) => void;
  onTopOut: () => void;
}) {
  const { seed, matchKey, matchOver, incoming, enabled, onAttack, onCheckpoint, onTopOut } = opts;

  const [prefs, setPrefs] = useState<AudioPrefs>(() => loadPrefs());
  // Re-read on every mount so a rebind in the panel takes effect on close.
  const [keyMap, setKeyMap] = useState<KeyMap>(() => loadKeyMap());
  const keyMapRef = useRef(keyMap);
  useEffect(() => { keyMapRef.current = keyMap; }, [keyMap]);
  // The runner is built once per match and lives outside React, so it reads
  // preferences through a ref rather than closing over a stale value.
  // Assigned in an effect: writing a ref during render is a render side
  // effect, even when it looks harmless.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  // One run per player per match, borrowed rather than built: it has to
  // survive this component being unmounted when the table is closed.
  const run = useMemo(() => acquireRun(matchKey, seed), [matchKey, seed]);
  const runner = run.runner;

  // Point the shared callbacks at the currently mounted table. Done in an
  // effect, not during render, because the runner may fire between renders.
  useEffect(() => {
    setRunCallbacks(matchKey, {
      onAttack,
      onCheckpoint,
      onTopOut,
      onEvent: (event: StackerSoundEvent) => {
        if (prefsRef.current.muted) return;
        switch (event.kind) {
          case 'clear': playClear(event.lines, event.spin, event.combo); break;
          case 'garbage': playSfx('garbage'); break;
          case 'topout': playSfx('topout'); break;
          case 'move': playSfx('move'); break;
          case 'rotate': playSfx('rotate'); break;
          case 'hold': playSfx('hold'); break;
          case 'drop': playSfx('drop'); break;
          case 'lock': playSfx('lock'); break;
        }
      },
    });
  }, [matchKey, onAttack, onCheckpoint, onTopOut]);

  // A finished match is not worth resuming, so it is dropped on the way out.
  // An unfinished one is left suspended for the player to come back to.
  const overRef = useRef(matchOver);
  useEffect(() => { overRef.current = matchOver; }, [matchOver]);
  useEffect(() => () => {
    if (overRef.current) releaseRun(matchKey);
  }, [matchKey]);

  const [stats, setStats] = useState<StackerStats>(() => runner.stats());

  useEffect(() => runner.onStats(setStats), [runner]);

  useEffect(() => {
    if (!enabled) return;
    runner.start();
    return () => runner.stop();
  }, [runner, enabled]);

  useEffect(() => {
    runner.receive(incoming);
  }, [runner, incoming]);

  // Danger music: the fuller the well, the more insistent it gets.
  useEffect(() => {
    if (prefs.muted) return;
    setMusicIntensity(Math.max(0, (stats.stackHeight - 8) / 12));
  }, [stats.stackHeight, prefs.muted, prefs.music]);

  /* ── keyboard ─────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!enabled) return;

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyM') {
        setPrefs((p) => {
          const next = { ...p, muted: !p.muted };
          savePrefs(next);
          setMuted(next.muted);
          if (next.muted) stopMusic();
          else startMusic();
          return next;
        });
        return;
      }
      const kind = keyMapRef.current[e.code];
      if (!kind) return;
      // The game owns these keys while it is on screen: arrows must not
      // scroll the channel underneath and space must not page down.
      e.preventDefault();
      // Browsers only allow audio to start from a gesture, so the first
      // keypress is where the sound comes up.
      // Music is not a choice the player makes — it just plays, once the
      // browser has let us start audio at all.
      if (!prefsRef.current.muted && ensureAudio()) startMusic();
      runner.press(kind);
    };

    const up = (e: KeyboardEvent) => {
      const kind = keyMapRef.current[e.code];
      if (kind) runner.release(kind);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      stopMusic();
    };
  }, [runner, enabled]);

  const toggleMuted = () => {
    setPrefs((p) => {
      const next = { ...p, muted: !p.muted };
      savePrefs(next);
      ensureAudio();
      setMuted(next.muted);
      if (next.muted) stopMusic();
      else startMusic();
      return next;
    });
  };

  /** Called when the rebinding panel closes, so new keys apply at once. */
  const reloadKeys = () => setKeyMap(loadKeyMap());

  return { runner, stats, prefs, toggleMuted, reloadKeys };
}
