'use client';

import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';

interface DMListProps {
  onNewDM: () => void;
}

export default function DMList({ onNewDM }: DMListProps) {
  const { threads, activeDMPubkey, setActiveDM } = useDMStore();
  const dmUnreads = useNotificationStore((s) => s.dmUnreads);

  return (
    <div className="w-60 bg-lc-dark border-r border-lc-border flex flex-col shrink-0" data-testid="dm-list">
      <div className="p-3 border-b border-lc-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-lc-white">Direct Messages</h3>
        <button
          onClick={onNewDM}
          className="text-lc-muted hover:text-lc-green transition-colors"
          title="New DM"
          data-testid="new-dm-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-lc-muted">No conversations yet</p>
            <button
              onClick={onNewDM}
              className="mt-2 text-xs text-lc-green hover:underline"
            >
              Start a conversation
            </button>
          </div>
        )}
        {threads.map((thread) => (
          <button
            key={thread.pubkey}
            onClick={() => setActiveDM(thread.pubkey)}
            className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
              activeDMPubkey === thread.pubkey
                ? 'bg-lc-border/40'
                : 'hover:bg-lc-border/20'
            }`}
            data-testid="dm-thread"
          >
            {thread.picture ? (
              <img src={thread.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
                {thread.displayName[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-lc-white truncate">{thread.displayName}</span>
                {(dmUnreads[thread.pubkey] || 0) > 0 && (
                  <span className="bg-lc-green text-lc-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                    {dmUnreads[thread.pubkey]}
                  </span>
                )}
              </div>
              {thread.lastMessage && (
                <p className="text-xs text-lc-muted truncate">{thread.lastMessage}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
