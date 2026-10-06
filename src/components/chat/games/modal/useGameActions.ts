'use client';

import { useCallback, useState } from 'react';
import type { GameSession } from '@/lib/games/session';
import { publishMove } from '@/services/games/transport';
import type { VestaAction } from '@/lib/games/vesta/definition';

/**
 * Publishing from the table: `run` wraps one relay publish with the busy
 * flag and the error line. Every button publishes one event and then does
 * nothing; the UI updates when the event comes back off the relay.
 */
export function useGameActions(session: GameSession | null | undefined) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relay rejected that');
    } finally {
      setBusy(false);
    }
  }, []);

  const onAction = useCallback(async (action: { cell: number }, seat: string) => {
    if (!session) return;
    await run(() => publishMove(session.channelId, session.id, session.turnIndex, action, seat));
  }, [session, run]);

  // Vesta moves name their seat: one account can hold several of them.
  const onSeatAction = useCallback(async (action: VestaAction, seat: string) => {
    if (!session) return;
    await run(() => publishMove(session.channelId, session.id, session.turnIndex, action, seat));
  }, [session, run]);

  return { busy, error, run, onAction, onSeatAction };
}
