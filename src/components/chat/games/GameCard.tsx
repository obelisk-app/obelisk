'use client';

import { memo, useEffect, useLayoutEffect } from 'react';
import { useGroupMemberInfo, useMyPubkey } from '@/lib/nostr-bridge';
import { useGamesStore } from '@/store/games';
import { useGameSession } from '@/hooks/chat/useChannelGames';
import { canJoin, controllerOf, type GameSession } from '@/lib/games/session';
import { seatDisplayLabel } from '@/lib/games/seat-label';
import { gameIcon, gameName } from '@/lib/games/catalog';
import { seedGameFromCache } from '@/lib/games/cache';
import { requestGameLoad } from '@/lib/games/resolve';
import { SEAT_COLORS } from './ChainReactionBoard';
import { useTranslation } from '@/i18n/context';

/**
 * How long a card without a session waits before asking the relay for its own
 * table. Long enough that a card the channel backfill is about to resolve
 * anyway doesn't cost a REQ; short enough that nobody reads it as a delay.
 */
export const RESOLVE_GRACE_MS = 400;

/**
 * In-channel card for a table, rendered from the `[[game:<id>]]` marker the
 * host posts as an ordinary chat message. The card is a pointer, not a copy:
 * status comes from replaying the table's own event log, so a message from an
 * hour ago shows the match as it stands now.
 *
 * Three things get it something to replay, in order of how fast they are:
 * the localStorage seed (before the first paint), the channel subscription, and
 * — for a table the channel sub cannot reach, which is any table older than its
 * 24-hour window — a direct lookup by id.
 */
function GameCard({ gameId }: { gameId: string }) {
  const session = useGameSession(gameId);
  const myPubkey = useMyPubkey();
  const setOpenGame = useGamesStore((s) => s.setOpenGame);

  // A layout effect, so the synchronous re-render it triggers lands before the
  // browser paints: the skeleton is committed but never seen.
  useLayoutEffect(() => {
    if (!session) seedGameFromCache(gameId);
    // Only on mount / id change — re-seeding a table the relay has since
    // extended would be pointless work and the seed no-ops anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (session) return;
    const t = setTimeout(() => requestGameLoad(gameId), RESOLVE_GRACE_MS);
    return () => clearTimeout(t);
  }, [gameId, session]);

  if (!session) {
    return (
      <span className="mt-1 block max-w-sm rounded-lg border border-lc-border bg-lc-dark p-3" data-testid="game-card-loading">
        <span className="lc-skeleton block h-4 w-32 rounded" />
      </span>
    );
  }

  const seats = session.status === 'waiting' ? session.joined : session.participants;

  return (
    <button
      type="button"
      onClick={() => setOpenGame(gameId)}
      className="mt-1 flex w-full max-w-sm items-center gap-3 rounded-lg border border-lc-border bg-lc-dark p-3 text-left transition-colors hover:border-lc-green/60"
      data-testid="game-card"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lc-green/15 text-base">
        {gameIcon(session.game)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-lc-white" data-testid="game-card-name">
          {gameName(session.game)}
        </span>
        <span className="block text-[11px] text-lc-muted">
          <StatusLabel session={session} myPubkey={myPubkey} />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {seats.slice(0, SEAT_COLORS.length).map((pk, i) => (
          <span key={pk} className="h-2 w-2 rounded-full" style={{ background: SEAT_COLORS[i]?.hex }} />
        ))}
      </span>
      <span className="shrink-0 rounded-full border border-lc-border px-2 py-0.5 text-[10px] text-lc-white">
        {canJoin(session, myPubkey) ? 'Join'
          : session.status === 'finished' ? 'Result'
          : 'Open'}
      </span>
    </button>
  );
}

// A card re-renders for its own table and nothing else. MessageContent re-renders
// on plenty a card does not care about.
export default memo(GameCard);

function StatusLabel({ session, myPubkey }: { session: GameSession; myPubkey: string | null }) {
  const { t } = useTranslation();
  switch (session.status) {
    case 'waiting':
      return <>{`Open table · ${session.joined.length}/${session.maxPlayers}`}</>;
    case 'in_progress':
      return <>{t('games.inProgress')}</>;
    case 'finished':
      if (session.draw || !session.winner) return <>{t('games.draw')}</>;
      // Naming the reader is safe here — this is rendered per viewer and never
      // published, unlike the seat labels that travel in the `start` event.
      if (controllerOf(session, session.winner) === myPubkey) return <>🏆 you won</>;
      return <WinnerLabel session={session} winner={session.winner} />;
    default:
      return <>{t('games.cancelled')}</>;
  }
}

/**
 * The winner's display name, in its own component so the member-metadata
 * subscription behind it only mounts for a table that actually has a winner.
 *
 * `useGroupMemberInfo` subscribes to the whole user-metadata map and warms a
 * profile fetch for every member of the channel. Calling it from the card
 * itself meant every card in the channel did that, and re-rendered on every
 * kind 0 that arrived, to resolve a string that most of them never showed.
 */
function WinnerLabel({ session, winner }: { session: GameSession; winner: string }) {
  const memberList = useGroupMemberInfo(session.channelId);
  // `winner` is a SEAT id, which on a hot-seat table is `pubkey#1` — looking
  // that up in the member list misses and leaves a mangled hex prefix on
  // screen. The controller is the person; the label is what the table chose to
  // call the seat.
  const controller = controllerOf(session, winner);
  const profileName = memberList.find((m) => m.pubkey === controller)?.displayName
    ?? controller.slice(0, 8);
  const label = seatDisplayLabel(session.seats.find((s) => s.id === winner)?.label, profileName);
  return <>{`🏆 ${label} won`}</>;
}
