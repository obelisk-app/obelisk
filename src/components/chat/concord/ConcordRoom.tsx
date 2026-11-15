'use client';

import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordRoom } from '@/hooks/chat/concord/useConcordRoom';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import Heading from '@/components/ui/layout/Heading';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import ConcordComposer from './ConcordComposer';
import ConcordChannelForm from './ConcordChannelForm';
import ConcordRoleForm from './ConcordRoleForm';
import ConcordMember from './ConcordMember';

export default function ConcordRoom({ community }: { community: ConcordCommunity }) {
  const t = useTranslations();
  const vm = useConcordRoom(community);
  return <div className="flex min-h-0 flex-1 flex-col md:flex-row" data-testid="concord-room">
    <aside className="shrink-0 overflow-y-auto border-r border-lc-border p-3 md:w-56">
      <Heading as="h2" variant="panel">{vm.state.metadata?.name}</Heading>
      <div className="flex gap-2 overflow-auto md:flex-col">
        {vm.categories.map(category => <div key={category.name}>
          {category.name && <Heading as="h3" variant="panel">{category.name}</Heading>}
          {category.channels.map(channel => <Button key={channel.channel_id} variant="bare" data-testid="concord-channel" disabled={!channel.accessible} aria-pressed={vm.channelId === channel.channel_id} onClick={() => vm.selectChannel(channel.channel_id)}>{channel.name}</Button>)}
        </div>)}
      </div>
      {vm.canInvite && <Button variant="bare" data-testid="concord-create-invite" onClick={vm.createInvite}>{t('chat.concord.invite')}</Button>}
      {vm.invite && <Input readOnly label={t('chat.concord.invite')} value={vm.invite} data-testid="concord-invite-link" />}
      <FormError>{vm.error}</FormError>
      {vm.canManageChannels && <ConcordChannelForm community={community} />}
      {vm.canManageRoles && <ConcordRoleForm community={community} />}
      {vm.members.map(pubkey => <ConcordMember key={pubkey} community={community} pubkey={pubkey} />)}
    </aside>
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="concord-messages">
        {vm.rows.map(row => <article key={row.rumor.id} data-testid="concord-message" className="mb-4 rounded-lg bg-lc-card p-3">
          <Text as="div" variant="caption">{row.rumor.pubkey.slice(0, 12)}</Text>
          {row.subject && <Heading as="h3" variant="panel">{row.subject}</Heading>}
          <Text as="div" className="whitespace-pre-wrap break-words">{row.content}</Text>
          {row.attachments.map((attachment, index) => <Button key={index} variant="bare" onClick={() => vm.download(attachment)}>{t('chat.concord.downloadAttachment')}</Button>)}
          <div className="flex gap-2">
            {row.reactions.map(reaction => <Text as="span" key={reaction.emoji}>{reaction.emoji} {reaction.count}</Text>)}
            <Button variant="bare" onClick={() => vm.react(row.rumor)}>{t('chat.concord.react')}</Button>
            {vm.canDelete(row.rumor) && <Button variant="bare" onClick={() => vm.remove(row.rumor)}>{t('chat.concord.delete')}</Button>}
          </div>
        </article>)}
      </div>
      {vm.channelId && !vm.state.dissolved && <ConcordComposer key={vm.channelId} community={community} channelId={vm.channelId} publication={vm.publication} />}
    </section>
  </div>;
}
