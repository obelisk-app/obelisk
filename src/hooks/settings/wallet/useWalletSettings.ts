'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMyPubkey } from '@/hooks/session/useSession';
import {
  disconnectNwcWallet,
  previewNwcUri,
  refreshNwcBudget,
} from '@/services/wallet/nwc-wallet';
import { errorText } from '@/utils/errors/error-text';
import { usePayingWallet } from '@/hooks/wallet/usePayingWallet';
import { useForm } from '@/hooks/common/useForm';
import { nwcConnectForm } from '@/services/wallet/nwc-connect-form';

export type NwcPreview = ReturnType<typeof previewNwcUri>;

/**
 * The wallet settings: the pasted link (checked as it is typed, without
 * contacting anything), Connect (which does contact the wallet, through the
 * relay hub; the common form over `nwcConnectForm`) and Disconnect.
 *
 * The pasted link is a spending credential. It lives in this hook's state
 * only until it is connected (then it is sealed and the field is cleared)
 * or the panel closes.
 */
export function useWalletSettings() {
  const t = useTranslations();
  const account = useMyPubkey();
  const paying = usePayingWallet();
  const form = useForm(nwcConnectForm(account));
  const { draft } = form.values;
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnected, setDisconnected] = useState(false);

  const preview = useMemo<{ ok: true; value: NwcPreview } | { ok: false; error: string } | null>(() => {
    if (!draft.trim()) return null;
    try {
      return { ok: true, value: previewNwcUri(draft) };
    } catch (e) {
      return { ok: false, error: errorText(t, e, 'settings.wallet.connectFailed') };
    }
  }, [draft, t]);

  // A budget is not kept on disk (it changes as the wallet spends): ask once per wallet shown.
  const walletKey = paying.nwc?.walletPubkey ?? null;
  useEffect(() => {
    if (account && walletKey) void refreshNwcBudget(account);
  }, [account, walletKey]);

  const changeDraft = (value: string) => {
    form.set('draft', value);
    form.setError(null);
    setDisconnected(false);
  };

  const connect = async () => {
    await form.submit();
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectNwcWallet();
      setDisconnected(true);
    } finally {
      setDisconnecting(false);
    }
  };

  return {
    paying,
    draft,
    changeDraft,
    preview,
    busy: form.submitting || disconnecting,
    error: form.error,
    disconnected,
    connect,
    disconnect,
  };
}
