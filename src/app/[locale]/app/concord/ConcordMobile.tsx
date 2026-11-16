'use client';
import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import ConcordMobileRoom from './ConcordMobileRoom';

export default function ConcordMobile() {
  const vm = useConcordClient();
  return vm.community ? <ConcordMobileRoom key={vm.community.communityId} community={vm.community} /> : null;
}
