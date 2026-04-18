'use client';

import { useEffect } from 'react';
import { useGamesStore, type GameState } from '@/store/games';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { resolvePlayerName } from '@/lib/games/player-name';
import TicTacToeBoard from './TicTacToeBoard';
import ChainReactionBoard from './ChainReactionBoard';
import ChessBoard from './ChessBoard';
import TurnClock from './TurnClock';
import GameOverModal from './GameOverModal';
import ShootingStars from '@/components/ShootingStars';
import PlayerAvatar from './PlayerAvatar';

async function postAction(gameId: string, action: any) {
  const res = await fetch(`/api/games/${gameId}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Acción inválida');
  }
}
async function postStart(gameId: string) {
  const res = await fetch(`/api/games/${gameId}/start`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo empezar');
  }
}
async function postLeave(gameId: string) {
  await fetch(`/api/games/${gameId}/leave`, { method: 'POST' });
}



interface Props {
  game: GameState;
}

// The main content pane while a game is in "fullscreen" (channel sidebar
// stays visible — this only replaces the channel content area, mirroring
// how a voice channel renders). Rendered by chat/page.tsx.
export default function GameFullscreenView({ game }: Props) {
  const me = useAuthStore((s) => s.user?.pubkey) ?? null;
  const memberList = useChatStore((s) => s.memberList);
  const nameOf = (pk: string) => resolvePlayerName(pk, me, memberList);
  const setFullscreenGame = useGamesStore((s) => s.setFullscreenGame);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const setMinimized = useGamesStore((s) => s.setMinimized);
  const isGameChatOpen = useGamesStore((s) => s.isGameChatOpen);
  const setGameChatOpen = useGamesStore((s) => s.setGameChatOpen);

  // On narrow viewports (phones), the game chat renders as a full-screen
  // overlay that covers the board — auto-hide it when the fullscreen view
  // mounts so the user actually sees the game first. They can reopen it
  // from the floating chat bubble.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setGameChatOpen(false);
    }
  }, [setGameChatOpen]);

  const title = game.type === 'tic-tac-toe' ? 'Tic-Tac-Toe'
    : game.type === 'chain-reaction' ? 'Chain Reaction'
    : game.type === 'chess' ? 'Ajedrez'
    : game.type;
  const iAmIn = !!me && game.participants.some((p) => p.pubkey === me);
  const iAmCreator = me && game.createdBy === me;
  const canStart = iAmCreator && game.status === 'waiting' && game.participants.length >= game.minPlayers;

  const exit = () => {
    setFullscreenGame(null);
    setOpenGame(game.id);
    setMinimized(true);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-2 relative" data-testid="game-fullscreen">
      {/* Reuses the same floating chat-bubble button the voice channel uses
          (top-right, rounded pill over the scene) so users get the same
          show/hide interaction here as in voice channels. */}
      {!isGameChatOpen && (
        <button
          onClick={() => setGameChatOpen(true)}
          style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 50 }}
          className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur shadow-lg"
          title="Mostrar chat del juego"
          data-testid="game-chat-toggle"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 relative overflow-hidden rounded-xl border border-lc-border shadow-xl">
        {/* Grid overlay — matches voice channel */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="absolute inset-0 z-0 pointer-events-none">
          <ShootingStars contained count={8} />
        </div>

        <GameOverModal
          game={game}
          onClose={() => {
            setFullscreenGame(null);
            setOpenGame(null);
          }}
        />

        <header className="relative z-10 h-12 px-4 flex items-center justify-between border-b border-white/10 bg-black/30 backdrop-blur shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">🎮</span>
            <h3 className="font-semibold text-white text-sm truncate">{title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              game.status === 'waiting' ? 'bg-lc-green/20 text-lc-green'
              : game.status === 'in_progress' ? 'bg-white/15 text-white'
              : 'bg-white/10 text-white/70'
            }`}>
              {game.status === 'waiting' ? 'Esperando'
                : game.status === 'in_progress' ? 'En curso'
                : game.status === 'finished' ? 'Terminado'
                : 'Cancelado'}
            </span>
            {!iAmIn && (game.status === 'in_progress' || game.status === 'waiting') && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                Espectador
              </span>
            )}
            {game.status === 'in_progress' && <TurnClock deadline={game.turnDeadline} />}
          </div>
        </header>

        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-md px-3 py-3 sm:px-6 sm:py-6 space-y-3 sm:space-y-5">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
            {game.participants.map((p) => {
              const isTurn = game.currentTurn === p.pubkey && game.status === 'in_progress';
              const isWinner = game.winnerPubkey === p.pubkey;
              return (
                <div
                  key={p.pubkey}
                  className={`
                    flex flex-col items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border
                    ${isTurn ? 'border-lc-green bg-lc-green/10' : 'border-lc-border bg-lc-dark'}
                    ${isWinner ? 'border-yellow-400 bg-yellow-400/10' : ''}
                  `}
                >
                  <PlayerAvatar pubkey={p.pubkey} myPubkey={me} size={36} />
                  <span className="text-xs sm:text-sm font-semibold text-lc-white truncate max-w-[110px]">{nameOf(p.pubkey)}</span>
                  <span className="text-[11px] sm:text-xs text-lc-muted">
                    {p.status === 'disqualified' ? '❌ descalificado'
                      : p.status === 'left' ? 'salió'
                      : isWinner ? '🏆 ganador'
                      : isTurn ? 'jugando' : 'listo'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="bg-lc-black/75 backdrop-blur-sm border border-white/10 rounded-2xl p-3 sm:p-6 shadow-xl">
            {game.type === 'tic-tac-toe' && (
              <TicTacToeBoard game={game} myPubkey={me} onAction={(a) => postAction(game.id, a)} />
            )}
            {game.type === 'chain-reaction' && (
              <ChainReactionBoard game={game} myPubkey={me} onAction={(a) => postAction(game.id, a)} />
            )}
            {game.type === 'chess' && (
              <ChessBoard game={game} myPubkey={me} onAction={(a) => postAction(game.id, a)} />
            )}
          </div>

          <div className="text-center">
            {game.status === 'waiting' && (
              <div className="text-xs text-lc-muted">
                {game.participants.length}/{game.maxPlayers} jugadores ·
                {' '}{game.participants.length < game.minPlayers
                  ? `faltan ${game.minPlayers - game.participants.length}`
                  : 'listo para empezar'}
              </div>
            )}
            {game.status === 'finished' && (
              <div className="text-sm font-semibold text-lc-green">
                {game.winnerPubkey
                  ? (game.winnerPubkey === me ? '🏆 Ganaste' : `🏆 Ganó ${nameOf(game.winnerPubkey)}`)
                  : 'Empate'}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {canStart && (
              <button onClick={() => postStart(game.id)} className="lc-pill-primary text-xs">Empezar</button>
            )}
            {iAmIn && (game.status === 'waiting' || game.status === 'in_progress') && (
              <button
                onClick={async () => {
                  await postLeave(game.id);
                  setFullscreenGame(null);
                  setOpenGame(null);
                }}
                className="lc-pill-secondary text-xs"
                data-testid="game-leave-fullscreen"
              >Abandonar</button>
            )}
            <button
              onClick={exit}
              className="lc-pill-secondary text-xs"
              data-testid="game-fullscreen-exit"
            >
              Minimizar
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
