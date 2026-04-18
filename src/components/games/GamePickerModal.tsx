'use client';

import { useEffect, useState } from 'react';
import { useGamesStore } from '@/store/games';
import { GameTypePreview } from './GamePreviews';

interface AvailableGame {
  type: string;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  defaultTurnTimeoutS: number;
}

export default function GamePickerModal() {
  const pickerOpen = useGamesStore((s) => s.pickerOpen);
  const setPickerOpen = useGamesStore((s) => s.setPickerOpen);
  const upsertGame = useGamesStore((s) => s.upsertGame);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const setMinimized = useGamesStore((s) => s.setMinimized);
  const [games, setGames] = useState<AvailableGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AvailableGame | null>(null);
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  // Chess time limit per turn. null = sin límite. Other games use their default.
  const [chessTimeS, setChessTimeS] = useState<number>(0);

  useEffect(() => {
    if (!pickerOpen) return;
    setSelected(null);
    setMaxPlayers(null);
    setSize('medium');
    setChessTimeS(0);
    fetch('/api/games/available')
      .then((r) => r.json())
      .then((d) => setGames(d.games || []))
      .catch(() => {});
  }, [pickerOpen]);

  if (!pickerOpen) return null;

  const close = () => { setPickerOpen(null); setSelected(null); setMaxPlayers(null); };

  const create = async (type: string, mp: number) => {
    setBusy(true);
    try {
      const options = type === 'chain-reaction' ? { size } : undefined;
      const turnTimeoutS = type === 'chess' ? chessTimeS : undefined;
      const res = await fetch('/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, channelId: pickerOpen.channelId, maxPlayers: mp, options, turnTimeoutS }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'No se pudo crear');
        return;
      }
      const data = await res.json();
      if (data.game) {
        upsertGame(data.game);
        // Default entry view is fullscreen — users can minimize to the
        // floating dock later.
        useGamesStore.getState().setFullscreenGame(data.game.id);
        useGamesStore.getState().setGameChatOpen(true);
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  const pickGame = (g: AvailableGame) => {
    // Games with a fixed player count skip the config screen, EXCEPT chess
    // which still needs to offer the time-limit choice.
    if (g.minPlayers === g.maxPlayers && g.type !== 'chess') {
      create(g.type, g.maxPlayers);
    } else {
      setSelected(g);
      setMaxPlayers(g.maxPlayers);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="bg-lc-dark border border-lc-border rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {!selected && (
          <>
            <h3 className="text-lc-white font-semibold mb-3">Elegí un juego</h3>
            <div className="space-y-2">
              {games.length === 0 && <div className="text-xs text-lc-muted">Cargando...</div>}
              {games.map((g) => (
                <button
                  key={g.type}
                  onClick={() => pickGame(g)}
                  disabled={busy}
                  className="w-full text-left p-3 rounded-lg border border-lc-border hover:bg-lc-border/40 transition-colors disabled:opacity-50 flex items-start gap-3"
                >
                  <GameTypePreview type={g.type} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-lc-white">{g.displayName}</div>
                    <div className="text-xs text-lc-muted mt-0.5">{g.description}</div>
                    <div className="text-xs text-lc-muted mt-1">
                      {g.minPlayers === g.maxPlayers ? `${g.minPlayers} jugadores` : `${g.minPlayers}–${g.maxPlayers} jugadores`} ·
                      {' '}turno {g.defaultTurnTimeoutS > 0 ? `${g.defaultTurnTimeoutS}s` : 'sin límite'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={close} className="lc-pill-secondary text-xs">Cancelar</button>
            </div>
          </>
        )}
        {selected && (
          <>
            <h3 className="text-lc-white font-semibold mb-1">{selected.displayName}</h3>
            <p className="text-xs text-lc-muted mb-4">{selected.description}</p>
            <div className="mb-4">
              <div className="text-xs text-lc-muted mb-2">
                ¿Cuántos jugadores? <span className="text-lc-white">{maxPlayers}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: selected.maxPlayers - selected.minPlayers + 1 }, (_, i) => selected.minPlayers + i).map((n) => (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n)}
                    className={`
                      w-9 h-9 rounded-full text-sm font-semibold border transition-colors
                      ${maxPlayers === n ? 'bg-lc-green text-lc-black border-lc-green' : 'border-lc-border text-lc-white hover:bg-lc-border/40'}
                    `}
                  >{n}</button>
                ))}
              </div>
              <div className="text-[11px] text-lc-muted mt-2">
                El creador ya cuenta como jugador 1. Los demás se unen desde el chat.
              </div>
            </div>
            {selected.type === 'chess' && (
              <div className="mb-4">
                <div className="text-xs text-lc-muted mb-2">Tiempo por jugada</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { s: 0, label: 'Sin límite' },
                    { s: 30, label: '30 s' },
                    { s: 60, label: '1 min' },
                    { s: 120, label: '2 min' },
                    { s: 300, label: '5 min' },
                    { s: 600, label: '10 min' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.s}
                      onClick={() => setChessTimeS(opt.s)}
                      className={`
                        px-2 py-2 rounded-lg border text-xs transition-colors
                        ${chessTimeS === opt.s ? 'bg-lc-green text-lc-black border-lc-green' : 'border-lc-border text-lc-white hover:bg-lc-border/40'}
                      `}
                    >
                      <div className="font-semibold">{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selected.type === 'chain-reaction' && (
              <div className="mb-4">
                <div className="text-xs text-lc-muted mb-2">Tamaño del tablero</div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'small', label: 'Chico', sub: '5×7' },
                    { key: 'medium', label: 'Mediano', sub: '6×9' },
                    { key: 'large', label: 'Grande', sub: '8×12' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setSize(opt.key)}
                      className={`
                        px-2 py-2 rounded-lg border text-xs transition-colors
                        ${size === opt.key ? 'bg-lc-green text-lc-black border-lc-green' : 'border-lc-border text-lc-white hover:bg-lc-border/40'}
                      `}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div className="opacity-80">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between mt-4">
              <button onClick={() => { setSelected(null); setMaxPlayers(null); }} className="lc-pill-secondary text-xs">Atrás</button>
              <button
                onClick={() => maxPlayers && create(selected.type, maxPlayers)}
                disabled={busy || !maxPlayers}
                className="lc-pill-primary text-xs disabled:opacity-50"
              >Crear partida</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
