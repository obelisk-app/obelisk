'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import Button from '@/components/ui/buttons/Button';
import ConcordSurface from './ConcordSurface';
export default function ConcordMobile() {
  const t = useTranslations();
  const vm = useConcordClient();
  const [channels, setChannels] = useState(false);
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="flex shrink-0 justify-between border-b border-lc-border p-2"><Button variant="bare" onClick={vm.close}>{t('common.back')}</Button><Button variant="bare" onClick={() => setChannels(!channels)}>{t('chat.concord.title')}</Button></div>
    {channels && <div className="max-h-64 overflow-auto"><ConcordSurface pane="sidebar" /></div>}
    <ConcordSurface pane="chat" />
  </div>;
}
