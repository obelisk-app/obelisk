'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { useTranslation } from '@/i18n/context';
import { useFileDrag } from './useFileDrag';

type FileDropZoneProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDrop'
> & {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
};

/** Wraps a composer so files dropped anywhere on it attach, with a full-cover "+" overlay while dragging. */
export function FileDropZone({ children, className = '', disabled, onFiles, ...props }: FileDropZoneProps) {
  const { t } = useTranslation();
  const { active, handlers } = useFileDrag(onFiles, disabled);

  return (
    <div
      {...props}
      className={['relative', className].join(' ')}
      {...handlers}
    >
      {children}
      {active && !disabled && (
        <div
          className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center bg-zinc-700/85 backdrop-blur-sm"
          role="status"
          aria-label={t('composer.dropFiles')}
          data-testid="file-drop-overlay"
        >
          <span aria-hidden="true" className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/80 text-8xl font-light text-white">
            +
          </span>
        </div>
      )}
    </div>
  );
}
