'use client';

import { useEffect, useRef, useState } from 'react';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { npubToHex, formatPubkey } from '@/lib/nostr';
import { getProfile, type ProfileEntry } from '@/lib/dm/profile-cache';
import ModalShell from '@/components/ModalShell';

interface NewDMModalProps {
  onClose: () => void;
  /**
   * Legacy in-memory profile cache passed by chat/page.tsx. Still consulted as
   * a synchronous fallback for the start-chat thread row, but live recipient
   * preview now flows through `@/lib/dm/profile-cache` (purplepag.es-aware
   * SWR via the partner's outbox).
   */
  profileCache?: Map<string, { name?: string; picture?: string }>;
}

function resolveToHex(input: string): string | null {
  return input.trim() ? npubToHex(input) : null;
}

export default function NewDMModal({ onClose, profileCache }: NewDMModalProps) {
  const [pubkey, setPubkey] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ partnerHex: string; entry: ProfileEntry | null } | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  const { addThread, setActiveDM } = useDMStore();
  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);

  // Whenever the input resolves to a fresh partner pubkey, hand off to
  // ProfileCache (which queries purplepag.es + the partner's outbox). Tear
  // down any prior subscription on input change / unmount.
  useEffect(() => {
    // Clean up any prior subscription before opening a new one.
    if (disposeRef.current) {
      disposeRef.current();
      disposeRef.current = null;
    }

    const partner = resolveToHex(pubkey);
    if (!partner || !myPubkey) {
      setPreview(null);
      return;
    }

    const { profile, dispose } = getProfile(myPubkey, partner, {
      onUpdate: (entry) => setPreview({ partnerHex: partner, entry }),
    });

    setPreview({ partnerHex: partner, entry: profile });
    disposeRef.current = dispose ?? null;

    return () => {
      if (disposeRef.current) {
        disposeRef.current();
        disposeRef.current = null;
      }
    };
  }, [pubkey, myPubkey]);

  const handleStart = () => {
    const pk = resolveToHex(pubkey);
    if (!pk) {
      setError('Enter a valid hex pubkey or npub');
      return;
    }

    // Prefer the live ProfileCache preview when available; fall back to the
    // legacy in-memory map so the thread row still shows something on cold
    // start.
    const liveParsed = preview?.partnerHex === pk ? preview.entry?.parsed : undefined;
    const legacy = profileCache?.get(pk);
    const displayName = liveParsed?.displayName ?? liveParsed?.name ?? legacy?.name ?? pk.slice(0, 8) + '...';
    const picture = liveParsed?.picture ?? legacy?.picture;

    addThread({
      pubkey: pk,
      displayName,
      picture,
      unreadCount: 0,
    });
    setActiveDM(pk);
    onClose();
  };

  const previewParsed = preview?.entry?.parsed;
  const previewName = previewParsed?.displayName ?? previewParsed?.name;
  const previewPicture = previewParsed?.picture;
  const previewPartner = preview?.partnerHex;

  return (
    <ModalShell
      onClose={onClose}
      panelClassName="bg-lc-dark border border-lc-border rounded-xl p-6 max-w-sm w-full mx-4"
    >
      <h3 className="text-lc-white text-lg font-semibold mb-3">New Direct Message</h3>
      <input
        type="text"
        value={pubkey}
        onChange={(e) => { setPubkey(e.target.value); setError(''); }}
        placeholder="Enter npub or hex pubkey"
        className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none mb-3"
        onKeyDown={(e) => e.key === 'Enter' && handleStart()}
        autoFocus
        data-testid="new-dm-pubkey-input"
      />
      {previewPartner && (
        <div
          className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-lc-black/60 border border-lc-border"
          data-testid="new-dm-preview"
        >
          {previewPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewPicture}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-lc-border" />
          )}
          <span className="text-sm text-lc-white truncate">
            {previewName ?? formatPubkey(previewPartner)}
          </span>
        </div>
      )}
      {error && <p className="text-xs text-red-400 mb-2" data-testid="new-dm-error">{error}</p>}
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
    </ModalShell>
  );
}
