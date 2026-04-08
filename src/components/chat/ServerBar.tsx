'use client';

import { useChatStore } from '@/store/chat';

export default function ServerBar() {
  const { servers, activeServerId, setActiveServer } = useChatStore();

  return (
    <aside className="w-[72px] bg-lc-black flex flex-col items-center py-3 gap-2 shrink-0 overflow-y-auto">
      {/* Home / DMs button (future) */}
      <button
        className="w-12 h-12 rounded-2xl bg-lc-dark hover:bg-lc-green/20 flex items-center justify-center text-lc-muted hover:text-lc-green transition-all hover:rounded-xl"
        title="Home"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>

      <div className="w-8 h-0.5 bg-lc-border rounded-full mx-auto" />

      {/* Server icons */}
      {servers.map((server) => {
        const isActive = server.id === activeServerId;
        return (
          <div key={server.id} className="relative group">
            {/* Active indicator */}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 h-10 bg-lc-white rounded-r-full" />
            )}
            <button
              onClick={() => setActiveServer(server.id)}
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
          </div>
        );
      })}

      {/* Add server button (future) */}
      <button
        className="w-12 h-12 rounded-2xl bg-lc-dark hover:bg-lc-green/20 flex items-center justify-center text-lc-green/60 hover:text-lc-green transition-all hover:rounded-xl"
        title="Add a Server"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </aside>
  );
}
