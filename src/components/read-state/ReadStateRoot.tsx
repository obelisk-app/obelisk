'use client';

import { useReadStateRuntime } from '@/hooks/read-state/useReadStateRuntime';

/** One lifecycle mount for both shells; changing viewport must not restart cursor sync. */
export default function ReadStateRoot() {
  useReadStateRuntime();
  return null;
}
