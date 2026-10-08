'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';

/**
 * The media kit's labelled copy pill. It keeps a text label, which the
 * icon-only `ui/CopyButton` cannot show, but shares that button's hook:
 * the shared 2000 ms (this pill used 1500), and a refused clipboard no
 * longer throws out of the click handler.
 */
export function CopyButton({ text }: { text: string }) {
  const t = useTranslations();
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button variant="pillSecondary" size="xs" onClick={() => { void copy(text); }}>
      {copied ? t('mediaKit.copied') : t('mediaKit.copy')}
    </Button>
  );
}
