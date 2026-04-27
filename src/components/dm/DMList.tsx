'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { useIdentity } from '@/hooks/useIdentity';
import { clearAccount } from '@/lib/dm/dm-cache';
import { _followsStore } from '@/lib/dm/follows';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

type Tab = 'follows' | 'others';

// Stable empty snapshot so useSyncExternalStore doesn't see a new object
// on every render (which would trigger React's "infinite update loop"
// guard). The snapshot identity matters — only the value field is read.
const EMPTY_SLOT = Object.freeze({ value: undefined as undefined });

function useFollowSet(myPubkey: string | null | undefined): Set<string> | null {
  // Bind to the keyed observable so the sidebar re-renders the moment
  // ingestKind3 lands. Without subscribing, a new follow added on
  // another client wouldn't move a thread between tabs until reload.
  const store = _followsStore();
  const slot = useSyncExternalStore(
    (cb) => (myPubkey ? store.subscribe(myPubkey, cb) : () => {}),
    () => (myPubkey ? store.get(myPubkey) : EMPTY_SLOT),
    () => EMPTY_SLOT,
  );
  return useMemo(
    () => (slot.value ? new Set(slot.value.pubkeys) : null),
    [slot.value],
  );
}

interface DMListProps {
  onNewDM: () => void;
}

export default function DMList({ onNewDM }: DMListProps) {
  const { threads, activeDMPubkey, setActiveDM, isLoadingThreads, setThreads, setMessages } = useDMStore();
  const dmUnreads = useNotificationStore((s) => s.dmUnreads);
  const { pubkey: myPubkey, signerReady } = useIdentity();
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const followSet = useFollowSet(myPubkey);
  // `null` means "user hasn't picked a tab yet" — we auto-route to whichever
  // bucket has threads on first paint so an empty Follows tab doesn't make
  // the user think they have no DMs. Once they click a tab, their choice
  // sticks for the session.
  const [explicitTab, setExplicitTab] = useState<Tab | null>(null);

  const { followsThreads, othersThreads } = useMemo(() => {
    const f: typeof threads = [];
    const o: typeof threads = [];
    for (const t of threads) {
      if (followSet?.has(t.pubkey)) f.push(t);
      else o.push(t);
    }
    return { followsThreads: f, othersThreads: o };
  }, [threads, followSet]);

  const tab: Tab = explicitTab
    ?? (followsThreads.length > 0 || othersThreads.length === 0 ? 'follows' : 'others');
  const setTab = setExplicitTab;
  const visibleThreads = tab === 'follows' ? followsThreads : othersThreads;
  const followsUnread = followsThreads.reduce((n, t) => n + (dmUnreads[t.pubkey] ?? 0), 0);
  const othersUnread = othersThreads.reduce((n, t) => n + (dmUnreads[t.pubkey] ?? 0), 0);

  // Read-only mode: disable New DM when no signer is attached. `signerReady`
  // is the reactive flag mirrored from `getNDK().signer != null` — see
  // `IdentityProvider` and `nostr.ts:onSignerChange` for the wiring.
  const hasSigner = signerReady;
  const newDMTitle = hasSigner
    ? 'New DM'
    : 'Sign in with a signing-capable method to use DMs';

  const handleWipe = () => {
    if (!myPubkey) return;
    clearAccount(myPubkey);
    setThreads([]);
    setMessages([]);
    setActiveDM(null);
    setShowWipeConfirm(false);
  };

  return (
    <div className="w-60 bg-lc-dark border-r border-lc-border flex flex-col shrink-0" data-testid="dm-list">
      <div className="p-3 border-b border-lc-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-lc-white">Direct Messages</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowWipeConfirm(true)}
            disabled={!myPubkey}
            className={`text-lc-muted hover:text-red-400 transition-colors p-1 ${
              myPubkey ? '' : 'opacity-50 cursor-not-allowed'
            }`}
            title="Clear DM cache for this account"
            data-testid="wipe-dm-cache"
            aria-label="Clear DM cache for this account"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
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

      {showWipeConfirm && (
        <ConfirmDialog
          title="Clear DM cache?"
          message="This wipes all locally-cached DM events, decrypted previews, and protocol overrides for this account. Messages still on relays will reappear next time you open a thread. Other accounts on this device are unaffected."
          confirmLabel="Clear"
          onConfirm={handleWipe}
          onCancel={() => setShowWipeConfirm(false)}
        />
      )}

      <div className="flex border-b border-lc-border shrink-0" role="tablist" data-testid="dm-tabs">
        {(['follows', 'others'] as const).map((t) => {
          const active = tab === t;
          const unread = t === 'follows' ? followsUnread : othersUnread;
          const count = t === 'follows' ? followsThreads.length : othersThreads.length;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={`flex-1 text-xs font-medium py-2 transition-colors capitalize relative ${
                active
                  ? 'text-lc-green border-b-2 border-lc-green -mb-px'
                  : 'text-lc-muted hover:text-lc-white'
              }`}
              data-testid={`dm-tab-${t}`}
            >
              {t} <span className="text-[10px] opacity-70">({count})</span>
              {unread > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-lc-green text-lc-black align-middle">
                  {unread}
                </span>
              )}
            </button>
          );
        })}
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
        ) : visibleThreads.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-lc-muted">
              {tab === 'follows'
                ? followSet === null
                  ? 'Loading your follow list…'
                  : "None of your follows have messaged you yet"
                : "Everyone you've messaged is in Follows"}
            </p>
          </div>
        ) : null}
        {visibleThreads.map((thread) => (
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
