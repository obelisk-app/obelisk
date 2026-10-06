'use client';

import { useRef, useState } from 'react';
import { useCurrentRelayUrl, useNipSigner } from '@/services/nostr-bridge';
import { useToastStore } from '@/store/toast';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import {
  checkZap,
  MARKER_NO_BRIDGE,
  sendZap,
  ZapError,
  type ZapErrorCode,
  type ZapRecipient,
} from '@/services/wallet/send-zap';
import { errorText } from '@/utils/errors/error-text';
import { mayHavePaid } from '@/lib/nwc';

const ERROR_KEY = {
  noAddress: 'chat.zap.errorNoAddress',
  noWallet: 'chat.zap.errorNoWallet',
  invalidAmount: 'chat.zap.errorInvalidAmount',
  noSigner: 'chat.zap.errorNoSigner',
} as const satisfies Record<ZapErrorCode, string>;

export interface UseSendZapArgs {
  recipient: ZapRecipient;
  amountSats: number;
  comment: string;
  lud16: string | null;
  /** Shown in the "sent" toast. */
  displayName: string;
  /** Called once the payment has gone through. */
  onSent: () => void;
}

/** The zap modal's send button: checks, pays, toasts, and reports a translated error. */
export function useSendZap({ recipient, amountSats, comment, lud16, displayName, onSent }: UseSendZapArgs) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const signer = useNipSigner();
  const currentRelay = useCurrentRelayUrl();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The wallet went silent after the request was sent: it may have paid.
  // Zap stays disabled until the modal is closed, since a retry would ask
  // for a fresh invoice and could pay twice.
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Set before the first await, so a second click in the same tick (before
  // `busy` has re-rendered the button disabled) cannot start a second payment.
  const inFlight = useRef(false);

  const send = async () => {
    if (inFlight.current) return;
    const check = checkZap({ recipient, amountSats, comment, lud16, signer, currentRelay });
    if (!check.ok) {
      setError(t(ERROR_KEY[check.reason]));
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    let markerError: string | null;
    try {
      ({ markerError } = await sendZap(check.zap));
    } catch (e) {
      if (mayHavePaid(e)) {
        setError(t('chat.zap.unconfirmed'));
        setUnconfirmed(true);
        setBusy(false);
        return; // inFlight stays set: no second payment from this modal
      }
      setError(e instanceof ZapError ? t(ERROR_KEY[e.code]) : errorText(t, e, 'chat.zap.failed'));
      inFlight.current = false;
      setBusy(false);
      return;
    }
    // The money has moved. From here nothing may show a failure or re-enable
    // Zap (busy stays on until the modal closes), or the user could pay twice.
    try {
      const title = t('chat.zap.sent', { amount: formatNumber(amountSats), name: displayName });
      useToastStore.getState().pushToast(markerError
        ? {
          title,
          body: t('chat.zap.markerFailed', {
            error: markerError === MARKER_NO_BRIDGE
              ? t('chat.zap.noBridge')
              : errorText(t, markerError, 'chat.zap.markerRejected'),
          }),
        }
        : { title, body: comment.trim() || '' });
    } catch (e) {
      console.warn('[zap] sent, but the confirmation toast failed', e);
    }
    onSent();
  };

  return { send, busy, error, unconfirmed };
}
