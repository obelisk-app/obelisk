'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, type Message } from '@/store/chat';
import { formatPubkey } from '@/lib/nostr';
import { useClickOutside } from '@/hooks/useClickOutside';

interface PinnedPanelProps {
  channelId: string;
  profileCache: Map<string, { name?: string; picture?: string }>;
  onJumpToMessage?: (messageId: string) => void;
}

interface PinnedApiResponse {
  messages: Array<
    Message & {
      author?: { displayName: string | null; picture: string | null } | null;
    }
  >;
}

/**
 * Compact "Pinned messages" button + dropdown panel.
 *
 * Shows the current count of pinned messages in the active channel and, when
 * clicked, fetches the pinned list from `/api/channels/:id/pins` and renders
 * each one. Clicking an item jumps to that message in the main scroll view.
 *
 * The component keeps count in sync with the in-memory chat store (so
 * real-time pin/unpin events update the badge immediately) and only fetches
 * the full list when the user actually opens the panel.
 */
export default function PinnedMessagesPanel({
  channelId,
  profileCache,
  onJumpToMessage,
}: PinnedPanelProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PinnedApiResponse['messages']>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Badge count is driven by the live store so real-time events update it
  // without refetching the list.
  const liveCount = useChatStore((state) =>
    state.messages.filter((m) => m.pinnedAt).length,
  );

  const fetchPins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/pins`);
      if (!res.ok) return;
      const data = (await res.json()) as PinnedApiResponse;
      setItems(data.messages);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (open) void fetchPins();
  }, [open, fetchPins, liveCount]);

  useClickOutside(rootRef, () => setOpen(false), { enabled: open });

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-lc-muted hover:text-lc-green hover:bg-lc-border/40 transition-colors"
        data-testid="pinned-panel-toggle"
        title="Ver mensajes fijados"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2l8 8-5 1-4 4-1 5-4-4-5 5v-3l5-5-4-4 5-1 4-4z" />
        </svg>
        <span>Fijados{liveCount > 0 ? ` · ${liveCount}` : ''}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-40 w-80 max-h-96 overflow-y-auto bg-lc-dark border border-lc-border rounded-xl shadow-lg"
          data-testid="pinned-panel"
        >
          <div className="sticky top-0 px-4 py-2 border-b border-lc-border bg-lc-dark">
            <h3 className="text-xs font-semibold text-lc-white uppercase tracking-wider">
              Mensajes fijados
            </h3>
          </div>
          {loading ? (
            <div className="p-4 text-xs text-lc-muted">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-xs text-lc-muted" data-testid="pinned-panel-empty">
              Aún no hay mensajes fijados en este canal.
            </div>
          ) : (
            <ul className="divide-y divide-lc-border">
              {items.map((m) => {
                const embedded = m.author || undefined;
                const cached = profileCache.get(m.authorPubkey);
                const name =
                  embedded?.displayName || cached?.name || formatPubkey(m.authorPubkey);
                const picture = embedded?.picture || cached?.picture || null;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        onJumpToMessage?.(m.id);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-lc-border/30 transition-colors"
                      data-testid={`pinned-item-${m.id}`}
                    >
                      <div className="flex items-start gap-2">
                        {picture ? (
                          <img
                            src={picture}
                            alt={name}
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-[10px] font-semibold shrink-0">
                            {name[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-lc-white truncate">
                            {name}
                          </div>
                          <div className="text-xs text-lc-muted line-clamp-2 break-words">
                            {m.content}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
