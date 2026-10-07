'use client';

import { useNip46SignerDeepLink } from '@/hooks/shell/login/useNip46SignerDeepLink';

/** Mounted beside the SDK modal while its picker is open; renders nothing itself. */
export function Nip46SignerDeepLink(): null {
  useNip46SignerDeepLink();
  return null;
}
