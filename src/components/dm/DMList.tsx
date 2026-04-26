'use client';

import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { getNDK } from '@/lib/nostr';

interface DMListProps {
  onNewDM: () => void;
}

export default function DMList({ onNewDM }: DMListProps) {
  const { threads, activeDMPubkey, setActiveDM, isLoadingThreads } = useDMStore();
  const dmUnreads = useNotificationStore((s) => s.dmUnreads);

  // Read-only mode: disable New DM when no signer is attached. Computed at
  // render-time; the NDK singleton is updated synchronously on login/logout
  // and any state change that would flip this also re-renders this tree.
  const hasSigner = Boolean(getNDK().signer);
  const newDMTitle = hasSigner
    ? 'New DM'
    : 'Sign in with a signing-capable method to use DMs';

  return (
    <div className="w-60 bg-lc-dark border-r border-lc-border flex flex-col shrink-0" data-testid="dm-list">
      <div className="p-3 border-b border-lc-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-lc-white">Direct Messages</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewDM}
            disabled={!hasSigner}
            className={`text-lc-muted hover:text-lc-green transition-colors p-1 ${
              hasSigner ? '' : 'opacity-50 cursor-not-allowed hover:text-lc-muted'
            }`}
            title={newDMTitle}
            data-testid="new-dm-cta"
            aria-label={newDMTitle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoadingThreads && threads.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="lc-skeleton-circle w-8 h-8" />
                <div className="space-y-1 flex-1">
                  <div className="lc-skeleton h-3 w-20" />
                  <div className="lc-skeleton h-3 w-32" />
                </div>
              </div>
            ))}
            <p className="text-xs text-lc-muted text-center pt-2">Loading DMs from relays…</p>
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-lc-muted">No conversations yet</p>
            <button
              onClick={onNewDM}
              disabled={!hasSigner}
              className={`mt-2 text-xs text-lc-green hover:underline ${
                hasSigner ? '' : 'opacity-50 cursor-not-allowed hover:no-underline'
              }`}
              title={newDMTitle}
              data-testid="new-dm-cta-empty"
            >
              {hasSigner ? 'Start a conversation' : 'Sign in to start a conversation'}
            </button>
          </div>
        ) : null}
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
