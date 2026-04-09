'use client';

import { useState } from 'react';
import { useDMStore } from '@/store/dm';

interface NewDMModalProps {
  onClose: () => void;
  profileCache: Map<string, { name?: string; picture?: string }>;
}

export default function NewDMModal({ onClose, profileCache }: NewDMModalProps) {
  const [pubkey, setPubkey] = useState('');
  const { addThread, setActiveDM } = useDMStore();

  const handleStart = () => {
    const pk = pubkey.trim();
    if (!pk) return;

    const profile = profileCache.get(pk);
    addThread({
      pubkey: pk,
      displayName: profile?.name || pk.slice(0, 8) + '...',
      picture: profile?.picture,
      unreadCount: 0,
    });
    setActiveDM(pk);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-lc-dark border border-lc-border rounded-xl p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lc-white text-lg font-semibold mb-3">New Direct Message</h3>
        <input
          type="text"
          value={pubkey}
          onChange={(e) => setPubkey(e.target.value)}
          placeholder="Enter npub or hex pubkey"
          className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none mb-3"
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          autoFocus
          data-testid="new-dm-pubkey-input"
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm text-lc-muted border border-lc-border hover:border-lc-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!pubkey.trim()}
            className="lc-pill-primary px-5 py-2 text-sm font-medium disabled:opacity-50"
            data-testid="start-dm-btn"
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}
