'use client';

import { useRelayInviteRedeemer } from '@/hooks/relay/invite/useRelayInviteRedeemer';

/** Subscription anchor for relay invites on `/app`: redeems the stored code for each key in use. */
export default function RelayInviteRoot() {
  useRelayInviteRedeemer();
  return null;
}
