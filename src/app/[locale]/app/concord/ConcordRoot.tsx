'use client';
import type { ReactNode } from 'react';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordWorkspace } from '@/hooks/chat/concord/useConcordWorkspace';
import { useConcordRoot } from '@/hooks/chat/concord/useConcordRoot';
import { AddRelayModal } from '@/app/[locale]/app/rail/AddRelayModal';

export default function ConcordRoot({ children }: { children: ReactNode }) {
  const vm = useConcordWorkspace();
  useConcordRoot();
  return <ConcordContext.Provider value={vm}>
    {children}
    {vm.open && vm.communityId === '' && <AddRelayModal initialConcord onClose={vm.close} />}
  </ConcordContext.Provider>;
}
