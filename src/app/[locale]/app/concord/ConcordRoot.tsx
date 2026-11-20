'use client';
import { useCommunityConnectionsSync } from '@/hooks/chat/community-connections/useCommunityConnectionsSync';
import type { ReactNode } from 'react';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordWorkspace } from '@/hooks/chat/concord/useConcordWorkspace';
import { useConcordRoot } from '@/hooks/chat/concord/useConcordRoot';
import { AddRelayModal } from '@/app/[locale]/app/rail/AddRelayModal';

export default function ConcordRoot({ children }: { children: ReactNode }) {
  const vm = useConcordWorkspace();
  useConcordRoot();
  useCommunityConnectionsSync();
  return <ConcordContext.Provider value={vm}>
    {children}
    {vm.open && vm.communityId === '' && <AddRelayModal fromInvite onClose={vm.close} />}
  </ConcordContext.Provider>;
}
