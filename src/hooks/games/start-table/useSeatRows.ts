'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GameSession } from '@/lib/games/session/session';
import { localSeatId, type SeatSpec } from '@/lib/games/protocol/protocol';
import { readResumeState } from '@/lib/games/vesta/resume';

export interface Row {
  /** Stable identity while editing; the published seat id is derived at the end. */
  rowId: string;
  label: string;
  /** Pubkey that will sign this seat's moves. */
  by: string;
  /** Name this seat had in the loaded save, when there is one. */
  savedName?: string;
}

/**
 * Seat ids: the first seat an account holds is its pubkey, the rest are
 * `<pubkey>#n`. That keeps an ordinary one-seat-each table byte-identical
 * to what clients published before hot-seat existed.
 */
export function seatSpecsFor(rows: readonly Row[], nameOf: (pubkey: string) => string): SeatSpec[] {
  const counts = new Map<string, number>();
  return rows.map((r) => {
    const n = counts.get(r.by) ?? 0;
    counts.set(r.by, n + 1);
    return { id: localSeatId(r.by, n), by: r.by, label: r.label || nameOf(r.by) };
  });
}

/**
 * The seat rows the host edits before a table starts: one per joined
 * account, or, for a resumed save, one per saved player. Holds the edits
 * (who signs, name, order, add, remove) and what they add up to.
 */
export function useSeatRows(session: GameSession, nameOf: (pubkey: string) => string) {
  const t = useTranslations();
  // A resumed table's shape is decided by the save, not by the host.
  const savedPlayers = useMemo(() => {
    const state = readResumeState((session.opts as { resume?: unknown }).resume);
    return state?.players.map((p) => p.name) ?? null;
  }, [session.opts]);

  const [rows, setRows] = useState<Row[]>(() => {
    if (savedPlayers) {
      // One row per saved player, all initially on the host, so a solo host
      // can carry on a whole hot-seat game they imported.
      return savedPlayers.map((name, i) => ({
        rowId: `saved-${i}`,
        label: name || t('games.newGame.player', { n: i + 1 }),
        by: session.joined[Math.min(i, session.joined.length - 1)] ?? session.createdBy,
        savedName: name,
      }));
    }
    return session.joined.map((pubkey, i) => ({
      rowId: `join-${i}`,
      label: nameOf(pubkey),
      by: pubkey,
    }));
  });

  const seatsFor = (pubkey: string) => rows.filter((r) => r.by === pubkey).length;

  const setController = (rowId: string, by: string) =>
    setRows((cur) => cur.map((r) => (r.rowId === rowId ? { ...r, by } : r)));

  const rename = (rowId: string, label: string) =>
    setRows((cur) => cur.map((r) => (r.rowId === rowId ? { ...r, label: label.slice(0, 32) } : r)));

  const addRow = () => {
    if (rows.length >= session.maxPlayers) return;
    setRows((cur) => [...cur, {
      rowId: `extra-${cur.length}-${cur.length}`,
      label: t('games.newGame.player', { n: cur.length + 1 }),
      by: session.createdBy,
    }]);
  };

  const removeRow = (rowId: string) => setRows((cur) => cur.filter((r) => r.rowId !== rowId));

  const move = (index: number, delta: number) => {
    setRows((cur) => {
      const next = [...cur];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const seats: SeatSpec[] = useMemo(() => seatSpecsFor(rows, nameOf), [rows, nameOf]);

  const tooFew = rows.length < session.minPlayers;
  const tooMany = rows.length > session.maxPlayers;
  const wrongForSave = !!savedPlayers && rows.length !== savedPlayers.length;

  return {
    rows,
    savedPlayers,
    seats,
    seatsFor,
    setController,
    rename,
    addRow,
    removeRow,
    move,
    tooFew,
    tooMany,
    wrongForSave,
  };
}
