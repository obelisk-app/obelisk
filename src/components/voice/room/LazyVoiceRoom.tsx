'use client';

import { lazy, Suspense, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import type VoiceRoomComponent from './VoiceRoom';
import Spinner from '@/components/ui/feedback/Spinner';

const VoiceRoom = lazy(() => import('./VoiceRoom'));

/** Shared voice-only download boundary for the app and standalone room route. */
export default function LazyVoiceRoom(props: ComponentProps<typeof VoiceRoomComponent>) {
  const t = useTranslations();
  return (
    <Suspense fallback={
      <div className="flex min-h-0 flex-1 items-center justify-center" data-testid="voice-room-loading">
        <Spinner size="lg" label={t('common.loading')} />
      </div>
    }>
      <VoiceRoom {...props} />
    </Suspense>
  );
}
