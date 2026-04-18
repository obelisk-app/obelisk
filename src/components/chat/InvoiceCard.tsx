'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseBolt11, type ParsedInvoice } from '@/lib/bolt11';
import { useChatStore } from '@/store/chat';
import { formatPubkey } from '@/lib/nostr';

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
  const memberList = useChatStore((s) => s.memberList);
  const pushEphemeral = useChatStore((s) => s.pushEphemeral);
  const invoicePayments = useChatStore((s) => s.invoicePayments);

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
    setBusy(true);
    try {
      const r = await fetch('/api/invoices/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice, messageId, channelId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setPaid({ payerPubkey: 'me', paidAt: d.paidAt || new Date().toISOString() });
      } else if (channelId) {
        const code = d.error as string | undefined;
        const msg =
          code === 'already_paid' ? '✅ Esta factura ya fue pagada.'
          : code === 'no_wallet' ? '⚠️ Configurá tu NWC en tu perfil para pagar.'
          : code === 'insufficient_funds' ? `⚠️ No tenés suficiente balance.`
          : code === 'expired' ? '⚠️ Esta factura ya expiró.'
          : `⚠️ No se pudo pagar (${code || r.status}).`;
        pushEphemeral(channelId, msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const payerName = paid
    ? (memberList.find((m) => m.pubkey === paid.payerPubkey)?.displayName ?? formatPubkey(paid.payerPubkey))
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
