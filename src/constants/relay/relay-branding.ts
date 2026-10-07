/**
 * Relay: relay branding. Values the code in `services/relay/relay-branding.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { RelayBranding } from '@/services/relay/relay-branding';

export const EMPTY_BRANDING: RelayBranding = {
  icon: '',
  banner: '',
  name: '',
  description: '',
  updatedAt: 0,
};
