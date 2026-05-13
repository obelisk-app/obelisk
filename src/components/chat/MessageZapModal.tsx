'use client';

import { useEffect, useState } from 'react';
import { useMessageZapStore } from '@/store/messageZap';
import { useToastStore } from '@/store/toast';
import { isWebLNAvailable, zapViaWebLN } from '@nostr-wot/wallet';
import type { NostrSigner } from '@nostr-wot/signers';
import { getDefaultRelays } from '@nostr-wot/data';
import { useProfile, useSigner } from '@nostr-wot/data/react';
import ModalShell from '@/components/ModalShell';

const QUICK_AMOUNTS = [21, 100, 500, 1000, 5000, 21000];

export default function MessageZapModal() {
  const target = useMessageZapStore((s) => s.target);
  const close = useMessageZapStore((s) => s.close);

  const [amount, setAmount] = useState<number>(100);
  const [comment, setComment] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setAmount(target.defaultAmountSats ?? 100);
    setComment('');
    setErr(null);
  }, [target]);

  // Hook order is fixed; call before any early return.
  const meta = useProfile(target?.recipientPubkey ?? null);
  const signer = useSigner();
  const lud16 = meta?.lud16 ?? target?.recipientLud16 ?? null;
  const displayName = target ? (meta?.displayName || meta?.name || target.displayName) : '';

  if (!target) return null;

  const send = async () => {
    if (!lud16) {
      setErr('This user has no Lightning address (lud16).');
      return;
    }
    if (!isWebLNAvailable()) {
      setErr('No WebLN extension detected. Install Alby (or similar) to zap.');
      return;
    }
    if (!amount || amount <= 0) {
      setErr('Enter a valid amount.');
      return;
    }
    if (!signer) {
      setErr('No active signer — log in first.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const relays = getDefaultRelays();
      // SessionSigner is structurally a NostrSigner — the SDK keeps it loosely
      // typed (signEvent returns `unknown`) so @nostr-wot/data has no hard
      // dependency on @nostr-wot/signers. The cast is safe at runtime.
      await zapViaWebLN({
        signer: signer as unknown as NostrSigner,
        recipientPubkey: target.recipientPubkey,
        recipientLud16: lud16,
        eventId: target.messageId ?? undefined,
        amountSats: amount,
        relays,
        comment: comment.trim() || undefined,
      });
      useToastStore.getState().pushToast({
        title: `⚡ Sent ${amount.toLocaleString()} sats to ${displayName}`,
        body: comment.trim() || '',
      });
      close();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      onClose={close}
      panelClassName="w-full max-w-md mx-4 rounded-xl border border-lc-border bg-lc-dark p-5"
    >
        <div className="mb-3 flex items-center gap-2">
          <BoltIcon className="h-5 w-5 text-yellow-400" />
          <h3 className="font-semibold text-lc-white">Zap {displayName}</h3>
        </div>
        <div className="mb-2 text-xs text-lc-muted">Amount (sats)</div>
        <input
          type="number"
          value={amount}
          min={1}
          autoFocus
          onChange={(e) => setAmount(parseInt(e.target.value, 10) || 0)}
          className="mb-3 w-full rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmount(a)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                amount === a
                  ? 'border-yellow-400 bg-yellow-400 text-lc-black'
                  : 'border-lc-border text-lc-white hover:bg-lc-border/40'
              }`}
            >
              {a.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="mb-2 text-xs text-lc-muted">Comment (optional)</div>
        <input
          type="text"
          value={comment}
          maxLength={200}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Nice post!"
          className="mb-3 w-full rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
        />
        {err && <p className="mb-3 break-words text-xs text-red-400">{err}</p>}
        {!lud16 && (
          <p className="mb-3 text-xs text-yellow-400">Recipient has no Lightning address — zap will fail.</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="lc-pill-secondary text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || !amount}
            className="inline-flex items-center gap-1 rounded-full bg-yellow-400 px-4 py-1.5 text-xs font-semibold text-lc-black hover:bg-yellow-300 disabled:opacity-50"
          >
            <BoltIcon className="h-3.5 w-3.5" />
            {busy ? 'Sending…' : `Zap ${amount.toLocaleString()} sats`}
          </button>
        </div>
    </ModalShell>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
