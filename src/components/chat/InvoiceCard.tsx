'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseBolt11, type ParsedInvoice } from '@/lib/bolt11';
import { useChatStore } from '@/store/chat';
import { useSignerReady } from '@/lib/nostr-bridge';
import { usePubkey } from '@nostr-wot/data/react';
import { formatPubkey, getNDK } from '@/lib/nostr';
import { useLocalWallet } from '@/lib/wallet/local-client';
import { toKEKSigner } from '@/lib/signer-adapters';

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
 * Any channel member with an NWC wallet can click Pay; the local NWC
 * payment flow runs entirely client-side.
 *
 * TODO(decentralized-invoice-tracking): the previous /api/invoices/* server
 * orchestrated race protection and broadcast paid-state across clients via
 * Socket.io. With the relays-only architecture we no longer have a server
 * to coordinate. The replacement is to publish a kind:9735-style
 * "invoice paid" Nostr event in the channel; other clients listen and
 * flip their own local paid state. Until that lands, paid state is
 * device-local only — refreshing or opening the channel from a different
 * device will not show "Paid" for invoices another user paid.
 */
export default function InvoiceCard({ invoice, messageId: _messageId, channelId }: Props) {
  const myPubkey = usePubkey();
  const signerReady = useSignerReady();
  const memberList = useChatStore((s) => s.memberList);
  const pushEphemeral = useChatStore((s) => s.pushEphemeral);
  const invoicePayments = useChatStore((s) => s.invoicePayments);

  const _ndk = getNDK();
  const _kekSigner = signerReady && myPubkey ? toKEKSigner(_ndk, _ndk.signer, myPubkey) : null;
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
      let paySucceeded = false;
      try {
        await (_walletClient as unknown as { payInvoice: (a: { invoice: string }) => Promise<{ preimage?: string }> })
          .payInvoice({ invoice });
        paySucceeded = true;
      } catch (e) {
        if (channelId) pushEphemeral(channelId, `⚠️ El pago falló (${(e as Error).message}).`);
      }

      if (paySucceeded) {
        // Local-only paid state. See TODO at the top of the file for the
        // relay-published-event replacement that will broadcast paid status
        // to other clients.
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
