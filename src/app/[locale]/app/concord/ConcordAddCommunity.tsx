'use client';
import { useTranslations } from 'next-intl';
import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import ConcordSetup from './ConcordSetup';
import FormError from '@/components/ui/forms/FormError';
import Text from '@/components/ui/layout/Text';
import { useConcordAdded } from '@/hooks/chat/concord/useConcordAdded';

export default function ConcordAddCommunity({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const vm = useConcordClient();
  const select = useConcordAdded(onClose);
  return <><FormError>{vm.error}</FormError>{vm.client ? <ConcordSetup client={vm.client} onSelect={select} /> : <Text>{t('chat.concord.loading')}</Text>}</>;
}
