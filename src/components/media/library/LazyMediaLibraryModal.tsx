'use client';

import { lazy, Suspense, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import type MediaLibraryModalComponent from './MediaLibraryModal';
import MediaLibraryShell from './MediaLibraryShell';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Skeleton from '@/components/ui/animations/Skeleton';

const MediaLibraryModal = lazy(() => import('./MediaLibraryModal'));

/** Shared loading boundary for settings, pickers, and media-item actions. */
export default function LazyMediaLibraryModal(props: ComponentProps<typeof MediaLibraryModalComponent>) {
  const t = useTranslations();
  return (
    <Suspense fallback={(
      <MediaLibraryShell embedded={props.embedded ?? false} onClose={props.onClose} closeOnEscape>
        <div className="flex min-h-0 w-full flex-col" data-testid="media-library-loading">
          <ModalHeader title={t('media.title')} subtitle={t('common.loading')} onClose={props.onClose} />
          <Skeleton className="m-4 h-48 rounded-xl" />
        </div>
      </MediaLibraryShell>
    )}>
      <MediaLibraryModal {...props} />
    </Suspense>
  );
}
