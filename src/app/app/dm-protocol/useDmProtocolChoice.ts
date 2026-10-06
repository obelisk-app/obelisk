'use client';

import { useState } from 'react';
import { useDMStore, type DMProtocol } from '@/store/dm';

export type DmProtocolChoice = {
  /** What the thread sends with now: the per-thread override, NIP-17 when there is none. */
  protocol: DMProtocol;
  /** True while the one-line NIP-04 explanation is waiting for a yes or no. */
  confirming: boolean;
  /** Pick a protocol. NIP-17 applies at once; NIP-04 asks first. */
  choose: (next: DMProtocol) => void;
  confirmNip04: () => void;
  cancel: () => void;
};

/**
 * The per-thread NIP-17 / NIP-04 choice both DM headers offer, written once.
 *
 * NIP-17 is the default and needs no confirmation. NIP-04 exists for older
 * clients that speak nothing else, and it is less private (relays see who
 * talks to whom and when) and carries no attachments here, so choosing it
 * first shows that in one line and waits for a yes. The choice persists per
 * account through `useDMStore.setProtocolOverride`, which the send path reads
 * (`resolveDmProtocol`).
 *
 * The pending confirmation remembers its peer, so moving to another thread
 * never carries a half-made choice across.
 */
export function useDmProtocolChoice(peer: string | null): DmProtocolChoice {
  const protocol = useDMStore((s) => (peer ? s.protocolOverrides[peer] : undefined)) ?? 'nip17';
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const set = (next: DMProtocol) => {
    if (peer) useDMStore.getState().setProtocolOverride(peer, next);
    setAskingFor(null);
  };
  return {
    protocol,
    confirming: peer !== null && askingFor === peer,
    choose: (next) => {
      if (next === protocol) setAskingFor(null);
      else if (next === 'nip04') setAskingFor(peer);
      else set('nip17');
    },
    confirmNip04: () => set('nip04'),
    cancel: () => setAskingFor(null),
  };
}
