'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { useConcordNavigation } from '@/store/chat/concord';

export default function ConcordLaunch() {
  const t = useTranslations();
  const show = useConcordNavigation(state => state.show);
  return <Button variant="bare" data-testid="concord-open" onClick={show} className="rounded-xl p-3 text-lc-green">{t('chat.concord.title')}</Button>;
}
