'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { JsGroup } from '@/services/nostr-bridge';
import { useConcordSearch } from '@/hooks/chat/concord/useConcordSearch';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';

export default function ConcordSearchResults({ community, groups, onSelect }: {
  community: ConcordCommunity; groups: JsGroup[]; onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  const vm = useConcordSearch(community, groups);
  return <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
    <Input type="search" label={t('chat.concord.searchLocal')} value={vm.query} onChange={event => vm.setQuery(event.target.value)} autoFocus />
    {vm.channels.map(group => <Button key={group.id} variant="ghost" onClick={() => onSelect(group.id)}>#{group.name}</Button>)}
    {vm.hits.map(message => <Button key={message.id} data-testid="concord-search-hit" variant="ghost" className="whitespace-pre-wrap text-left" onClick={() => onSelect(message.groupId)}>{message.content}</Button>)}
  </div>;
}
