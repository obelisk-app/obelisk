'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { useInvoiceCard } from '@/hooks/chat/zaps/useInvoiceCard';
import PayingWalletNote from './PayingWalletNote';

interface Props {
  invoice: string;
  /** The message and channel the invoice came in; unused until paid state is published to the channel. */
  messageId?: string;
  channelId?: string;
}

/**
 * A BOLT11 invoice posted in chat, as a payable card. Pay asks for one
 * confirm click showing the amount, the description and which wallet will
 * pay, then pays through the same wallet path zaps use (`src/services/wallet/`).
 *
 * Paid state is this browser's own record: other members, and this browser
 * after a reload, do not see who paid. Publishing an "invoice paid" event in
 * the channel would let every client show it; nothing does that yet.
 */
export default function InvoiceCard({ invoice }: Props) {
  const t = useTranslations();
  const card = useInvoiceCard(invoice);

  if (card.view === 'invalid') {
    return (
      <span className="block mt-1 px-3 py-2 rounded-lg border border-lc-border text-xs text-lc-muted">
        {t('chat.invoice.invalid')}
      </span>
    );
  }

  const showError = card.error && card.view !== 'paid';

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
              {card.view === 'noAmount' ? t('chat.invoice.noAmount') : t('chat.invoice.amount', { amount: card.amount })}
            </span>
            {card.description && (
              <span className="block text-[11px] text-lc-muted truncate">{card.description}</span>
            )}
          </span>
        </span>
        {card.view === 'paid' ? (
          <span className="shrink-0 text-[11px] text-lc-green font-semibold" data-testid="invoice-paid">
            {card.payerName ? t('chat.invoice.paidBy', { name: card.payerName }) : t('chat.invoice.paid')}
          </span>
        ) : card.view === 'expired' ? (
          <span className="shrink-0 text-[11px] text-lc-muted">{t('chat.invoice.expired')}</span>
        ) : card.view === 'ready' || card.view === 'paying' ? (
          <Button
            variant="pill"
            size="xs"
            onClick={card.requestPay}
            disabled={card.view === 'paying'}
            className="shrink-0"
            data-testid="invoice-pay-btn"
          >
            {t(card.view === 'paying' ? 'chat.invoice.paying' : 'chat.invoice.pay')}
          </Button>
        ) : null}
      </span>
      {card.view === 'noAmount' && (
        <span className="mt-2 block text-[11px] text-lc-muted" data-testid="invoice-no-amount">
          {t('chat.invoice.noAmountReason')}
        </span>
      )}
      {card.view === 'confirming' && (
        <span className="mt-2 block rounded-lg border border-lc-border bg-lc-card/60 p-2" data-testid="invoice-confirm">
          <span className="block text-xs text-lc-white">
            {t('chat.invoice.confirmPrompt', { amount: card.amount })}
          </span>
          {card.description && (
            <span className="mt-1 block text-[11px] text-lc-muted break-words">
              {t('chat.invoice.confirmFor', { description: card.description })}
            </span>
          )}
          <PayingWalletNote className="mt-1" />
          <span className="mt-2 flex gap-2">
            <Button variant="pill" size="xs" onClick={card.confirm} data-testid="invoice-confirm-btn">
              {t('chat.invoice.confirm')}
            </Button>
            <Button variant="outlinePill" size="xs" onClick={card.cancel} data-testid="invoice-cancel-btn">
              {t('common.cancel')}
            </Button>
          </span>
        </span>
      )}
      {showError && (
        <span role="alert" className="mt-2 block text-[11px] text-red-400" data-testid="invoice-error">
          {card.error}
        </span>
      )}
      <span className="mt-2 block text-[10px] text-lc-muted font-mono truncate" title={invoice}>
        {invoice.slice(0, 30)}…{invoice.slice(-10)}
      </span>
    </span>
  );
}
