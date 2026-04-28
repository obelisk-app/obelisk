'use client';

import { useEffect } from 'react';
import { useGamesStore } from '@/store/games';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { pushErrorToast } from '@/store/toast';
import { resolvePlayerName } from '@/lib/games/player-name';
import PlayerAvatar from './PlayerAvatar';
import { GameTypePreview } from './GamePreviews';

// Rendered inline in chat wherever `[[game:<id>]]` appears.
// Shows live participant count, status, and final result.
export default function GameEmbedCard({ gameId }: { gameId: string }) {
  const game = useGamesStore((s) => s.games[gameId]);
  const upsertGame = useGamesStore((s) => s.upsertGame);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const setMinimized = useGamesStore((s) => s.setMinimized);
  const me = useAuthStore((s) => s.user?.pubkey) ?? null;
  const memberList = useChatStore((s) => s.memberList);

  useEffect(() => {
    if (game) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/games/${gameId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.game) upsertGame(data.game);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [gameId, game, upsertGame]);

  if (!game) {
    return (
      <div className="rounded-lg border border-lc-border bg-lc-dark/70 px-3 py-2 text-xs text-lc-muted">
        🎮 Cargando juego...
      </div>
    );
  }

  const iAmIn = me && game.participants.some((p) => p.pubkey === me);
  const isOpen = game.status === 'waiting' || game.status === 'in_progress';

  const join = async () => {
    const res = await fetch(`/api/games/${game.id}/join`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      pushErrorToast('No se pudo unir', data.error);
      return;
    }
    useGamesStore.getState().setFullscreenGame(game.id);
    useGamesStore.getState().setGameChatOpen(true);
  };
  const openDock = () => {
    useGamesStore.getState().setFullscreenGame(game.id);
    useGamesStore.getState().setGameChatOpen(true);
  };

  const title = game.type === 'tic-tac-toe' ? 'Tic-Tac-Toe'
    : game.type === 'chain-reaction' ? 'Chain Reaction'
    : game.type === 'chess' ? 'Ajedrez'
    : game.type;
  const statusLabel =
    game.status === 'waiting' ? 'Esperando jugadores'
    : game.status === 'in_progress' ? 'En curso'
    : game.status === 'finished' ? (game.winnerPubkey ? (game.winnerPubkey === me ? 'Ganaste' : `Ganó ${resolvePlayerName(game.winnerPubkey, me, memberList)}`) : 'Empate')
    : 'Cancelado';

  return (
    <div className="rounded-lg border border-lc-border bg-lc-dark/70 p-3 w-full max-w-sm">
      <div className="flex items-start gap-3 mb-2">
        <GameTypePreview type={game.type} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lc-white text-sm">{title}</span>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
              game.status === 'waiting' ? 'bg-lc-green/20 text-lc-green'
              : game.status === 'in_progress' ? 'bg-lc-border/60 text-lc-white'
              : 'bg-lc-border/30 text-lc-muted'
            }`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex -space-x-2">
              {game.participants.slice(0, 5).map((p) => (
                <PlayerAvatar key={p.pubkey} pubkey={p.pubkey} myPubkey={me} size={22} className="ring-2 ring-lc-dark" />
              ))}
            </div>
            <span className="text-xs text-lc-muted">
              {game.participants.length}/{game.maxPlayers}
            </span>
          </div>
        </div>
      </div>
      {game.status === 'finished' && game.winnerPubkey && (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-yellow-400/10 border border-yellow-400/30">
          <span className="text-lg">🏆</span>
          <PlayerAvatar pubkey={game.winnerPubkey} myPubkey={me} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-yellow-300/80 leading-tight">Ganador</div>
            <div className="text-sm font-semibold text-lc-white truncate">
              {game.winnerPubkey === me ? '¡Vos!' : resolvePlayerName(game.winnerPubkey, me, memberList)}
            </div>
          </div>
        </div>
      )}
      {game.status === 'finished' && !game.winnerPubkey && (
        <div className="text-sm text-lc-muted mb-3">Empate</div>
      )}
      <div className="flex gap-2">
        {isOpen && !iAmIn && game.participants.length < game.maxPlayers && game.status === 'waiting' && (
          <button onClick={join} className="lc-pill-primary text-xs">Unirme</button>
        )}
        <button onClick={openDock} className="lc-pill-secondary text-xs">
          {iAmIn ? 'Abrir' : 'Ver'}
        </button>
      </div>
    </div>
  );
}

function shortPk(pk: string, me: string | null) {
  if (pk === me) return 'vos';
  return pk.slice(0, 8);
}
