import type { FormSpec } from '@/constants/common/form';
import { connectNwcWallet, previewNwcUri } from './nwc-wallet';

export type NwcConnectValues = { draft: string };

/** Whether a pasted link reads as a wallet link at all (nothing is contacted). */
function readsAsLink(draft: string): boolean {
  try {
    previewNwcUri(draft);
    return true;
  } catch {
    return false;
  }
}

/**
 * Connecting a Nostr Wallet Connect wallet (Settings > Wallet): the pasted
 * link, sent only once it reads as a link (checked without contacting
 * anything) and an account is signed in. The link is a
 * spending credential: the field is cleared once it is connected (and
 * sealed by the wallet service).
 */
export function nwcConnectForm(account: string | null): FormSpec<NwcConnectValues> {
  return {
    initial: { draft: '' },
    ready: (values) => account !== null && values.draft.trim() !== '' && readsAsLink(values.draft),
    submit: (values) => connectNwcWallet(account ?? '', values.draft),
    failure: 'settings.wallet.connectFailed',
    resetOnSuccess: true,
  };
}
