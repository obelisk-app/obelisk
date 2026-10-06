'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMyPubkey, useUserMetadata } from '@/services/nostr-bridge';
import { useFormat } from '@/i18n/useFormat';
import type { MessageKey } from '@/i18n/keys';
import { useHasExpired } from '@/hooks/useHasExpired';
import { parseBolt11, type ParsedInvoice } from '@/utils/bolt11';
import { errorText } from '@/utils/errors/error-text';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useInvoicePaymentsStore } from '@/store/invoice-payments';
import { useToastStore } from '@/store/toast';
import {
  InvoicePayError,
  invoiceRefusal,
  payInvoice,
  type InvoicePayRefusal,
} from '@/services/wallet/pay-invoice';

const REFUSAL_KEY = {
  alreadyPaid: 'chat.invoice.alreadyPaid',
  inProgress: 'chat.invoice.inProgress',
  noAmount: 'chat.invoice.noAmountReason',
  expired: 'chat.invoice.expiredReason',
  noWallet: 'chat.invoice.noWallet',
} as const satisfies Record<InvoicePayRefusal, MessageKey>;

/** What the card shows, in priority order: a paid invoice stays paid whatever else changes. */
export type InvoiceCardView = 'invalid' | 'paid' | 'paying' | 'expired' | 'noAmount' | 'confirming' | 'ready';

/**
 * The invoice card's state: decode, the payment record shared by every card
 * for the same invoice, and Pay, then Confirm. All money moves through
 * `payInvoice`; this hook only words the outcome.
 */
export function useInvoiceCard(invoice: string) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const myPubkey = useMyPubkey();
  const parsed = useMemo<ParsedInvoice | null>(() => {
    try { return parseBolt11(invoice); } catch { return null; }
  }, [invoice]);
  const record = useInvoicePaymentsStore((s) => (parsed ? s.byHash[parsed.paymentHash] : undefined));
  const hasExpired = useHasExpired(parsed?.expiresAt);
  const paidBy = record?.status === 'paid' ? record.payerPubkey : null;
  const payerMeta = useUserMetadata(paidBy);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view: InvoiceCardView = !parsed ? 'invalid'
    : record?.status === 'paid' ? 'paid'
      : record?.status === 'paying' ? 'paying'
        : hasExpired ? 'expired'
          : parsed.amountMsats <= 0 ? 'noAmount'
            : confirming ? 'confirming'
              : 'ready';

  /** Pay: check what can be checked without the wallet, then ask for one confirm click. */
  const requestPay = () => {
    if (!parsed || view !== 'ready') return;
    const refusal = invoiceRefusal(parsed);
    setError(refusal ? t(REFUSAL_KEY[refusal]) : null);
    setConfirming(!refusal);
  };

  const cancel = () => setConfirming(false);

  const confirm = async () => {
    if (!parsed || view !== 'confirming') return;
    setConfirming(false);
    setError(null);
    try {
      await payInvoice(invoice, parsed, myPubkey);
    } catch (e) {
      // A second click while the first is paying: the card already says so.
      if (e instanceof InvoicePayError && e.code === 'inProgress') return;
      setError(e instanceof InvoicePayError ? t(REFUSAL_KEY[e.code]) : errorText(t, e, 'chat.invoice.payFailed'));
      return;
    }
    // The invoice is recorded paid before this line. Anything that fails from
    // here on must not be reported as a failed payment, or invite another one.
    try {
      useToastStore.getState().pushToast({
        title: t('chat.invoice.paidToast', { amount: formatNumber(parsed.amountSats) }),
        body: parsed.description,
      });
    } catch (e) {
      console.warn('[invoice] paid, but the confirmation toast failed', e);
    }
  };

  const payerName = paidBy
    ? payerMeta?.displayName || payerMeta?.name || shortNpubLabel(paidBy) || null
    : null;

  return {
    view,
    amount: parsed ? formatNumber(parsed.amountSats) : '',
    description: parsed?.description ?? '',
    payerName,
    error,
    requestPay,
    confirm,
    cancel,
  };
}
