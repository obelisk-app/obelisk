'use client';

import { useGamesStore, type GameState } from '@/store/games';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { pushErrorToast } from '@/store/toast';
import { resolvePlayerName } from '@/lib/games/player-name';
import TicTacToeBoard from './TicTacToeBoard';
import ChainReactionBoard from './ChainReactionBoard';
import TurnClock from './TurnClock';
import GameOverModal from './GameOverModal';
import PlayerAvatar from './PlayerAvatar';


async function postAction(gameId: string, action: any) {
  const res = await fetch(`/api/games/${gameId}/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    pushErrorToast('Acción inválida', data.error);
  }
}

async function postStart(gameId: string) {
  const res = await fetch(`/api/games/${gameId}/start`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    pushErrorToast('No se pudo empezar', data.error);
  }
}

async function postLeave(gameId: string, onDone?: () => void) {
  await fetch(`/api/games/${gameId}/leave`, { method: 'POST' });
  onDone?.();
}

export default function GameDock() {
  const games = useGamesStore((s) => s.games);
  const openGameId = useGamesStore((s) => s.openGameId);
  const minimized = useGamesStore((s) => s.minimized);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const setMinimized = useGamesStore((s) => s.setMinimized);
  const setFullscreenGame = useGamesStore((s) => s.setFullscreenGame);
  const fullscreenGameId = useGamesStore((s) => s.fullscreenGameId);
  const me = useAuthStore((s) => s.user?.pubkey) ?? null;

  const active = openGameId ? games[openGameId] : null;

  if (!active) return null;
  // If the user entered fullscreen for this game, hide the floating dock —
  // the main pane already shows the board, and chat lives in the rail.
  if (fullscreenGameId === active.id) return null;
  const myTurn = active.status === 'in_progress' && active.currentTurn === me;

  if (minimized || openGameId !== active.id) {
    // Floating pill
    return (
      <button
        onClick={() => { setOpenGame(active.id); setMinimized(false); }}
        className={`
          fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full
          shadow-lg border text-sm font-medium transition-colors
          ${myTurn ? 'bg-lc-green text-lc-black border-lc-green animate-pulse' : 'bg-lc-dark text-lc-white border-lc-border hover:bg-lc-border/50'}
        `}
      >
        <span className="text-xs">🎮</span>
        <span>{gameDisplay(active.type)}</span>
        {active.status === 'in_progress' && (
          myTurn ? <span>Tu turno</span> : <TurnClock deadline={active.turnDeadline} />
        )}
        {active.status === 'waiting' && (
          <span className="text-xs opacity-80">{active.participants.length}/{active.maxPlayers}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-lc-dark border border-lc-border rounded-xl shadow-2xl overflow-hidden">
      <GameOverModal game={active} onClose={() => setOpenGame(null)} />
      <div className="flex items-center justify-between px-4 py-2 border-b border-lc-border">
        <div className="text-sm font-semibold text-lc-white">{gameDisplay(active.type)}</div>
        <div className="flex items-center gap-2">
          {active.status === 'in_progress' && <TurnClock deadline={active.turnDeadline} />}
          <button
            onClick={() => { setFullscreenGame(active.id); }}
            className="text-lc-muted hover:text-lc-white text-xs"
            title="Pantalla completa"
            data-testid="game-dock-fullscreen"
          >⛶</button>
          <button
            onClick={() => setMinimized(true)}
            className="text-lc-muted hover:text-lc-white text-xs"
            title="Minimizar"
          >−</button>
          <button
            onClick={() => setOpenGame(null)}
            className="text-lc-muted hover:text-lc-white text-xs"
            title="Cerrar"
          >×</button>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-center gap-2">
          {active.participants.map((p) => {
            const isTurn = active.currentTurn === p.pubkey && active.status === 'in_progress';
            const isWinner = active.winnerPubkey === p.pubkey;
            return (
              <div
                key={p.pubkey}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
                  isWinner ? 'border-yellow-400 bg-yellow-400/10'
                  : isTurn ? 'border-lc-green bg-lc-green/10'
                  : 'border-lc-border bg-lc-dark'
                }`}
                title={p.pubkey}
              >
                <PlayerAvatar pubkey={p.pubkey} myPubkey={me} size={20} />
                <span className="text-xs text-lc-white truncate max-w-[80px]">
                  {resolvePlayerName(p.pubkey, me, useChatStore.getState().memberList)}
                </span>
              </div>
            );
          })}
        </div>
        <GameStatusLine game={active} me={me} />
        {active.type === 'tic-tac-toe' && (
          <TicTacToeBoard game={active} myPubkey={me} onAction={(a) => postAction(active.id, a)} />
        )}
        {active.type === 'chain-reaction' && (
          <ChainReactionBoard game={active} myPubkey={me} onAction={(a) => postAction(active.id, a)} />
        )}
        <GameControls game={active} me={me} />
      </div>
    </div>
  );
}

function gameDisplay(type: string) {
  if (type === 'tic-tac-toe') return 'Tic-Tac-Toe';
  if (type === 'chain-reaction') return 'Chain Reaction';
  return type;
}

function GameStatusLine({ game, me }: { game: GameState; me: string | null }) {
  const memberList = useChatStore((s) => s.memberList);
  if (game.status === 'waiting') {
    return (
      <div className="text-xs text-lc-muted">
        Esperando jugadores · {game.participants.length}/{game.maxPlayers}
      </div>
    );
  }
  if (game.status === 'in_progress') {
    const turnName = resolvePlayerName(game.currentTurn, me, memberList);
    return <div className="text-xs text-lc-muted">Turno de <span className="text-lc-white">{turnName}</span></div>;
  }
  if (game.status === 'finished') {
    if (game.winnerPubkey) {
      const iWon = game.winnerPubkey === me;
      const name = resolvePlayerName(game.winnerPubkey, me, memberList);
      return <div className="text-sm text-lc-green font-medium">🏆 {iWon ? 'Ganaste' : `Ganó ${name}`}</div>;
    }
    return <div className="text-sm text-lc-muted">Empate</div>;
  }
  return <div className="text-xs text-lc-muted">Cancelado</div>;
}

function GameControls({ game, me }: { game: GameState; me: string | null }) {
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const setFullscreenGame = useGamesStore((s) => s.setFullscreenGame);
  const iAmIn = me && game.participants.some((p) => p.pubkey === me);
  const iAmCreator = me && game.createdBy === me;
  const canStart = iAmCreator && game.status === 'waiting' && game.participants.length >= game.minPlayers;
  const handleLeave = () => {
    postLeave(game.id, () => {
      setFullscreenGame(null);
      setOpenGame(null);
    });
  };
  return (
    <div className="flex gap-2 pt-1">
      {canStart && (
        <button onClick={() => postStart(game.id)} className="lc-pill-primary text-xs">Empezar</button>
      )}
      {iAmIn && (game.status === 'waiting' || game.status === 'in_progress') && (
        <button onClick={handleLeave} className="lc-pill-secondary text-xs" data-testid="game-leave-dock">Salir</button>
      )}
    </div>
  );
}
