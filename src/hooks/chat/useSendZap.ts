'use client';

import { useState } from 'react';
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

  const send = async () => {
    const check = checkZap({ recipient, amountSats, comment, lud16, signer, currentRelay });
    if (!check.ok) {
      setError(t(ERROR_KEY[check.reason]));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { markerError } = await sendZap(check.zap);
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
      onSent();
    } catch (e) {
      setError(e instanceof ZapError ? t(ERROR_KEY[e.code]) : errorText(t, e, 'chat.zap.failed'));
    } finally {
      setBusy(false);
    }
  };

  return { send, busy, error };
}
