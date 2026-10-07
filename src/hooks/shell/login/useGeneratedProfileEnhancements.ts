'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { attachGeneratedProfileEnhancements } from '@/services/shell/desktop/generated-profile';
import type { ProfileDraft } from '@/services/shell/desktop/profile-media-pickers';

const ignoreDraft = () => {};

/** Keeps the SDK's generated-profile step enhanced while the login modal is mounted. */
export function useGeneratedProfileEnhancements(onDraftChange: (patch: ProfileDraft) => void = ignoreDraft) {
  const t = useTranslations();
  useEffect(() => attachGeneratedProfileEnhancements(t, onDraftChange), [onDraftChange, t]);
}
