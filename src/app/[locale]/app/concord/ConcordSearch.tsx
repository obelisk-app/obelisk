'use client';
import { useTranslations } from 'next-intl';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import { useConcordSearch } from '@/hooks/chat/concord/useConcordSearch';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';

export default function ConcordSearch({ groups, messages, onClose, onSelect }: {
  groups: JsGroup[]; messages: JsMessage[]; onClose: () => void; onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  const vm = useConcordSearch(groups, messages);
  return <Sheet screen="search" label={t('common.search')} onClose={onClose}>
    <SheetHeader title={t('common.search')} onBack={onClose} />
    <Input type="search" label={t('chat.concord.searchLocal')} value={vm.query} onChange={event => vm.setQuery(event.target.value)} autoFocus />
    {vm.channels.map(group => <Button key={group.id} variant="ghost" onClick={() => onSelect(group.id)}>#{group.name}</Button>)}
    {vm.hits.map(message => <Text key={message.id} as="p" size="sm">{message.content}</Text>)}
  </Sheet>;
}
