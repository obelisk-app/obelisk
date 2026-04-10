'use client';

import { useState } from 'react';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import CreateServerModal from './CreateServerModal';

export default function ServerBar() {
  const { servers, activeServerId, setActiveServer, addServer } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const { isDMMode, setDMMode } = useDMStore();
  const { channelUnreads, channelMentions, channelServerMap, dmUnreads } = useNotificationStore();
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Compute per-server unread state
  const serverUnreads = new Map<string, { count: number; hasMention: boolean }>();
  for (const [channelId, count] of Object.entries(channelUnreads)) {
    const serverId = channelServerMap[channelId];
    if (!serverId || count === 0) continue;
    const current = serverUnreads.get(serverId) || { count: 0, hasMention: false };
    current.count += count;
    if (channelMentions[channelId]) current.hasMention = true;
    serverUnreads.set(serverId, current);
  }
  const totalDMUnreads = Object.values(dmUnreads).reduce((sum, n) => sum + n, 0);

  return (
    <aside className="w-[72px] bg-lc-black flex flex-col items-center py-3 gap-2 shrink-0 overflow-y-auto">
      {/* DMs button */}
      <div className="relative">
        <button
          onClick={() => setDMMode(!isDMMode)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl ${
            isDMMode
              ? 'bg-lc-green/20 text-lc-green rounded-xl'
              : 'bg-lc-dark hover:bg-lc-green/20 text-lc-muted hover:text-lc-green'
          }`}
          title="Direct Messages"
          data-testid="dm-btn"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
        {totalDMUnreads > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {totalDMUnreads > 99 ? '99+' : totalDMUnreads}
          </span>
        )}
      </div>

      <div className="w-8 h-0.5 bg-lc-border rounded-full mx-auto" />

      {/* Server icons */}
      {servers.map((server) => {
        const isActive = server.id === activeServerId && !isDMMode;
        const unread = serverUnreads.get(server.id);
        return (
          <div key={server.id} className="relative group">
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 h-10 bg-lc-white rounded-r-full" />
            )}
            {!isActive && unread && unread.count > 0 && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 h-2 bg-lc-white rounded-r-full" />
            )}
            <button
              onClick={() => { setDMMode(false); setActiveServer(server.id); }}
              className={`w-12 h-12 flex items-center justify-center transition-all ${
                isActive
                  ? 'rounded-xl bg-lc-green/20'
                  : 'rounded-2xl bg-lc-dark hover:rounded-xl hover:bg-lc-green/20'
              }`}
              title={server.name}
            >
              {server.icon ? (
                <img
                  src={server.icon}
                  alt={server.name}
                  className="w-12 h-12 rounded-[inherit] object-cover"
                />
              ) : (
                <span className="text-lc-white font-semibold text-sm">
                  {server.name.slice(0, 2).toUpperCase()}
                </span>
              )}
            </button>
            {!isActive && unread && unread.hasMention && (
              <span className="absolute -bottom-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unread.count > 99 ? '99+' : unread.count}
              </span>
            )}
          </div>
        );
      })}

      {/* Add server button — only visible to server owners */}
      {user && servers.some((s) => s.ownerPubkey === user.pubkey) && (
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-12 h-12 rounded-2xl bg-lc-dark hover:bg-lc-green/20 flex items-center justify-center text-lc-green/60 hover:text-lc-green transition-all hover:rounded-xl"
          title="Add a Server"
          data-testid="add-server-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      )}

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(server) => {
            addServer(server);
            setActiveServer(server.id);
          }}
        />
      )}
    </aside>
  );
}
