'use client';

import { useGeneratedProfileEnhancements } from '@/hooks/session/useGeneratedProfileEnhancements';
import type { ProfileDraft } from '@/services/shell/desktop/profile-media-pickers';

/**
 * Enhances the SDK's generated-profile step with native media pickers and
 * name generation (`services/shell/desktop/generated-profile.ts`).
 * Renders nothing.
 */
export default function GeneratedProfileEnhancements({
  onDraftChange,
}: {
  onDraftChange?: (patch: ProfileDraft) => void;
}): null {
  useGeneratedProfileEnhancements(onDraftChange);
  return null;
}
