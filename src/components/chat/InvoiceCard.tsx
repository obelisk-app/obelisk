'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseBolt11, type ParsedInvoice } from '@/lib/bolt11';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { formatPubkey, getNDK } from '@/lib/nostr';
import { useLocalWallet } from '@/lib/wallet/local-client';
import { toKEKSigner } from '@/lib/ndk-kek-signer';

interface Props {
  invoice: string;
  messageId?: string;
  channelId?: string;
}

interface PaidState {
  payerPubkey: string;
  paidAt: string;
}

/**
 * Renders a public BOLT11 invoice posted in chat as a payable card.
 * Any channel member with an NWC wallet can click Pay; the first winner
 * flips the card to "Paid" for everyone via the `invoice-paid` socket event.
 */
export default function InvoiceCard({ invoice, messageId, channelId }: Props) {
  const myPubkey = useAuthStore((s) => s.user?.pubkey);
  const memberList = useChatStore((s) => s.memberList);
  const pushEphemeral = useChatStore((s) => s.pushEphemeral);
  const invoicePayments = useChatStore((s) => s.invoicePayments);

  const _ndk = getNDK();
  const _kekSigner = myPubkey ? toKEKSigner(_ndk, _ndk.signer, myPubkey) : null;
  const { client: _walletClient } = useLocalWallet(myPubkey ?? null, _kekSigner);

  const parsed = useMemo<ParsedInvoice | null>(() => {
    try { return parseBolt11(invoice); } catch { return null; }
  }, [invoice]);

  const [paid, setPaid] = useState<PaidState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!parsed) return;
    const hit = invoicePayments[parsed.paymentHash];
    if (hit) setPaid({ payerPubkey: hit.payerPubkey, paidAt: hit.paidAt });
  }, [parsed, invoicePayments]);

  // Lazy status fetch on mount (in case socket event was missed or this
  // invoice was paid before the client connected).
  useEffect(() => {
    if (!parsed || paid) return;
    let cancelled = false;
    fetch(`/api/invoices/status?hashes=${parsed.paymentHash}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const hit = (d.paid as Array<{ paymentHash: string; payerPubkey: string; paidAt: string }> | undefined)?.[0];
        if (hit) setPaid({ payerPubkey: hit.payerPubkey, paidAt: hit.paidAt });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [parsed, paid]);

  if (!parsed) {
    return (
      <span className="block mt-1 px-3 py-2 rounded-lg border border-lc-border text-xs text-lc-muted">
        ⚠️ Invoice inválida
      </span>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const expired = !paid && parsed.expiresAt && parsed.expiresAt < now;

  const pay = async () => {
    if (busy || paid || expired) return;
    if (!_walletClient) {
      if (channelId) pushEphemeral(channelId, '⚠️ Configurá tu wallet primero.');
      return;
    }
    setBusy(true);
    try {
      // Step 1: claim the invoice on the server (race protection).
      const claimRes = await fetch('/api/invoices/pay/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice, messageId, channelId }),
      });
      if (!claimRes.ok) {
        const d = await claimRes.json().catch(() => ({}));
        const code = d.error as string | undefined;
        if (channelId) {
          const msg =
            code === 'already_paid' ? '✅ Esta factura ya fue pagada.'
            : code === 'pending' ? '⏳ Otro usuario está pagando esta factura.'
            : code === 'expired' ? '⚠️ Esta factura ya expiró.'
            : `⚠️ No se pudo iniciar el pago (${code || claimRes.status}).`;
          pushEphemeral(channelId, msg);
        }
        return;
      }
      const claimBody = await claimRes.json();
      const paymentHash: string | undefined = claimBody?.paymentHash;

      // Step 2: pay client-side via local NWC.
      let preimage: string | undefined;
      let paySucceeded = false;
      try {
        const result = await (_walletClient as unknown as { payInvoice: (a: { invoice: string }) => Promise<{ preimage?: string }> })
          .payInvoice({ invoice });
        preimage = result?.preimage;
        paySucceeded = true;
      } catch (e) {
        if (channelId) pushEphemeral(channelId, `⚠️ El pago falló (${(e as Error).message}).`);
      }

      // Step 3: report outcome to server.
      if (paymentHash) {
        try {
          await fetch('/api/invoices/pay/confirm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentHash,
              status: paySucceeded ? 'paid' : 'failed',
              preimage,
            }),
          });
        } catch { /* server will sweep stale pending after 30s */ }
      }

      if (paySucceeded) {
        setPaid({
          payerPubkey: myPubkey || '?',
          paidAt: new Date().toISOString(),
        });
      }
    } catch {
      if (channelId) pushEphemeral(channelId, '⚠️ Error de red al intentar pagar.');
    } finally {
      setBusy(false);
    }
  };

  const payerName = paid
    ? (memberList.find((m) => m.pubkey === paid.payerPubkey)?.displayName
       ?? (paid.payerPubkey.length === 64 ? formatPubkey(paid.payerPubkey) : null))
    : null;

  return (
    <span
      className="block mt-1 max-w-sm rounded-xl border border-lc-border bg-lc-black/40 p-3"
      data-testid="invoice-card"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-lc-green text-lg" aria-hidden>⚡</span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-lc-white">
              {parsed.amountSats.toLocaleString()} sats
            </span>
            {parsed.description && (
              <span className="block text-[11px] text-lc-muted truncate">{parsed.description}</span>
            )}
          </span>
        </span>
        {paid ? (
          <span className="shrink-0 text-[11px] text-lc-green font-semibold" data-testid="invoice-paid">
            ✅ Pagada{payerName ? ` · ${payerName}` : ''}
          </span>
        ) : expired ? (
          <span className="shrink-0 text-[11px] text-lc-muted">Expirada</span>
        ) : (
          <button
            onClick={pay}
            disabled={busy}
            className="lc-pill-primary text-xs shrink-0 disabled:opacity-50"
            data-testid="invoice-pay-btn"
          >
            {busy ? 'Pagando…' : 'Pagar'}
          </button>
        )}
      </span>
      <span className="mt-2 block text-[10px] text-lc-muted font-mono truncate" title={invoice}>
        {invoice.slice(0, 30)}…{invoice.slice(-10)}
      </span>
    </span>
  );
}
