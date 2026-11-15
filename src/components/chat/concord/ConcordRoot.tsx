'use client';

import { useConcordRoot } from '@/hooks/chat/concord/useConcordRoot';
import Workspace from './ConcordWorkspace';

export default function ConcordRoot() {
  const open = useConcordRoot();
  return open ? <Workspace /> : null;
}
