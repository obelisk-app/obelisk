'use client';

import { useEffect, useMemo } from 'react';
import { useGamesStore, type GameState } from '@/store/games';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';

export default function ActivitiesPanel() {
  const open = useGamesStore((s) => s.activitiesPanelOpen);
  const setOpen = useGamesStore((s) => s.setActivitiesPanelOpen);
  const games = useGamesStore((s) => s.games);
  const upsertGame = useGamesStore((s) => s.upsertGame);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const setMinimized = useGamesStore((s) => s.setMinimized);
  const setPickerOpen = useGamesStore((s) => s.setPickerOpen);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const me = useAuthStore((s) => s.user?.pubkey) ?? null;

  useEffect(() => {
    if (!open || !activeServerId) return;
    fetch(`/api/games?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => r.json())
      .then((d) => {
        for (const g of d.games || []) upsertGame(g);
      })
      .catch(() => {});
  }, [open, activeServerId, upsertGame]);

  const serverGames = useMemo(() => {
    return Object.values(games)
      .filter((g) => g.serverId === activeServerId && (g.status === 'waiting' || g.status === 'in_progress'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [games, activeServerId]);

  if (!open) return null;

  const join = async (g: GameState) => {
    if (g.participants.some((p) => p.pubkey === me)) {
      useGamesStore.getState().setFullscreenGame(g.id); useGamesStore.getState().setGameChatOpen(true); setOpen(false);
      return;
    }
    const res = await fetch(`/api/games/${g.id}/join`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'No se pudo unir');
      return;
    }
    useGamesStore.getState().setFullscreenGame(g.id); useGamesStore.getState().setGameChatOpen(true); setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-lc-dark border border-lc-border rounded-xl w-full max-w-lg p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lc-white font-semibold">Actividades</h3>
          <button
            onClick={() => {
              if (!activeChannelId) { alert('Abrí un canal primero'); return; }
              setOpen(false);
              setPickerOpen({ channelId: activeChannelId });
            }}
            className="lc-pill-primary text-xs"
          >
            + Nuevo juego
          </button>
        </div>
        {serverGames.length === 0 ? (
          <div className="text-xs text-lc-muted py-8 text-center">
            No hay juegos abiertos. ¡Creá uno!
          </div>
        ) : (
          <div className="space-y-2">
            {serverGames.map((g) => (
              <div key={g.id} className="p-3 rounded-lg border border-lc-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-lc-white">
                    {g.type === 'tic-tac-toe' ? 'Tic-Tac-Toe' : g.type}
                  </div>
                  <div className="text-xs text-lc-muted">
                    {g.participants.length}/{g.maxPlayers} ·{' '}
                    {g.status === 'waiting' ? 'Esperando' : 'En curso'}
                  </div>
                </div>
                <button onClick={() => join(g)} className="lc-pill-secondary text-xs">
                  {g.participants.some((p) => p.pubkey === me) ? 'Abrir' : 'Unirme'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={() => setOpen(false)} className="lc-pill-secondary text-xs">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
