import type { WalletKind } from '@/types/wallet/wallet';

/** Shared display/payment policy; the caller owns session and provider discovery. */
export function selectWalletKind({ active, loginMethod, nwc, webln }: {
  active: boolean;
  loginMethod: string | null;
  nwc: boolean;
  webln: boolean;
}): WalletKind | null {
  if (!active) return null;
  if (nwc) return 'nwc';
  return loginMethod === 'nip07' && webln ? 'webln' : null;
}
