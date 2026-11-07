import { useTranslations } from 'next-intl';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useNipSigner } from '@/hooks/session/useSession';
import { checkZap, sendZap, ZapError } from '@/services/wallet/send-zap';
import { mayHavePaid } from '@nostr-wot/wallet/nwc';
import { useToastStore } from '@/store/feedback/toast';
import type { ZapTarget } from '@/store/chat/message-zap';
import { errorText } from '@/utils/errors/error-text';
import { MARKER_NO_BRIDGE } from '@/constants/wallet/zap';

/** Immediate emoji and slash-command payments; sendZap guards every entry point. */
export function useQuickZap() {
  const t = useTranslations();
  const signer = useNipSigner();
  const currentRelay = useCurrentRelayUrl();
  return async (target: ZapTarget, amountSats: number, comment = '') => {
    const keys = {
      noAddress: 'chat.zap.errorNoAddress', noWallet: 'chat.zap.errorNoWallet',
      invalidAmount: 'chat.zap.errorInvalidAmount', noSigner: 'chat.zap.errorNoSigner',
      self: 'chat.zapCommand.self', pending: 'chat.zap.pending', unconfirmed: 'chat.zap.unconfirmed',
    } as const;
    let markerError: string | null;
    try {
      const check = checkZap({ recipient: target, amountSats, comment,
        lud16: target.recipientLud16 ?? null, signer, currentRelay });
      if (!check.ok) throw new ZapError(check.reason);
      ({ markerError } = await sendZap(check.zap));
    } catch (error) {
      const uncertain = mayHavePaid(error) || (error instanceof ZapError && error.code === 'unconfirmed');
      useToastStore.getState().pushToast({ title: t(uncertain ? 'chat.zap.unconfirmed' : 'chat.zap.failed'),
        body: uncertain ? '' : error instanceof ZapError ? t(keys[error.code]) : errorText(t, error) });
      return false;
    }
    try {
      useToastStore.getState().pushToast({
        title: t('chat.zap.sent', { amount: String(amountSats), name: target.displayName }),
        body: markerError ? t('chat.zap.markerFailed', { error: markerError === MARKER_NO_BRIDGE
          ? t('chat.zap.noBridge') : errorText(t, markerError, 'chat.zap.markerRejected') }) : comment,
      });
    } catch (error) { console.warn('[zap] sent, but feedback failed', error); }
    return true;
  };
}
