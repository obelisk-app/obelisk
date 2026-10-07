'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';

/** Upload one item and create a pack: in the sidebar on a wide screen, under the header on a phone. */
export default function LibraryActions({ busy, onUpload, onCreate, className }: {
  busy: boolean;
  onUpload: () => void;
  onCreate: () => void;
  className: string;
}) {
  const t = useTranslations();
  return (
    <div className={className}>
      <Button variant="outline" tone="accent" size="sm" disabled={busy} onClick={onUpload}>{t('media.upload')}</Button>
      <Button size="lg" onClick={onCreate}>{t('media.createPack')}</Button>
    </div>
  );
}
