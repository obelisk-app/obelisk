'use client';
import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import ConcordRoom from './ConcordRoom';
export default function ConcordSurface({ pane }: { pane: 'sidebar' | 'chat' }) {
  const vm = useConcordClient();
  return vm.community ? <ConcordRoom key={vm.community.communityId} community={vm.community} pane={pane} /> : null;
}
