'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordRoom } from '@/hooks/chat/concord/useConcordRoom';
import { ChannelProtocolContext } from '@/contexts/chat/channel-protocol';
import { ChannelHeader } from '@/app/[locale]/app/panes/channel/ChannelHeader';
import { ChannelMessageList } from '@/app/[locale]/app/panes/channel/ChannelMessageList';
import { ChatComposer } from '@/app/[locale]/app/panes/channel/ChatComposer';
import { SidebarHeader } from '@/app/[locale]/app/panes/sidebar/SidebarHeader';
import { CreateGroupSection } from '@/app/[locale]/app/panes/sidebar/CreateGroupSection';
import ConcordBrandingForm from './ConcordBrandingForm';
import { GroupNode } from '@/app/[locale]/app/panes/sidebar/GroupNode';
import CopyButton from '@/components/ui/buttons/CopyButton';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import Input from '@/components/ui/forms/Input';
import FormError from '@/components/ui/forms/FormError';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ConcordChannelForm from './ConcordChannelForm';
import ConcordRoleForm from './ConcordRoleForm';
import ConcordMember from './ConcordMember';

export default function ConcordRoom({ community, pane }: { community: ConcordCommunity; pane: 'sidebar' | 'chat' }) {
  const t = useTranslations();
  const { scroller, ...vm } = useConcordRoom(community);
  return <ChannelProtocolContext.Provider value={vm.protocol}>
    {pane === 'sidebar' ? <aside className="flex h-full min-h-0 flex-col bg-lc-dark" data-testid="concord-channels">
      <SidebarHeader privateCommunity relay="" conn="" branding={vm.branding} brandingLoaded showTitleSkeleton={false} isRelayOperator={vm.canEditBranding || vm.canInvite} onOpenSettings={vm.openSettings} />
      {vm.canManageChannels && <CreateGroupSection count={vm.groups.length} onCreated={vm.selectChannel} />}
      <div className="flex-1 overflow-y-auto p-2">
        {vm.categories.map(category => <div key={category.name}>{category.name && <Heading as="h3" variant="panel" className="px-2 pt-4 pb-1">{category.name}</Heading>}{category.groups.map(group => <GroupNode key={group.id} group={group} depth={0} childrenByParent={{}} groupsById={{}} view={vm.group ? { kind: 'group', groupId: vm.group.id } : { kind: 'empty' }} onSelect={vm.selectGroup} />)}</div>)}
      </div>
    </aside> : <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-lc-dark" data-testid="concord-room">
      <ChannelHeader groupId={vm.group?.id ?? ''} group={vm.group} isAdmin={vm.canManageChannels} showMembers={vm.showMembers} onToggleMembers={vm.toggleMembers} onOpenSettings={vm.openSettings} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" data-testid="concord-messages">
            <ChannelMessageList groupId={vm.group?.id ?? ''} group={vm.group} messages={vm.messages} messagesById={vm.messagesById} reactions={vm.reactions} zapTotals={new Map()} isAdmin={false} onReply={vm.setReplyingTo} emptyStage="welcome" />
          </div>
          {vm.group && !vm.state.dissolved && <ChatComposer key={vm.group.id} groupId={vm.group.id} group={vm.group} messages={vm.messages} replyingTo={vm.replyingTo} setReplyingTo={vm.setReplyingTo} onOpenNewGame={vm.openSettings} />}
        </div>
        {vm.showMembers && <aside className="w-60 shrink-0 overflow-y-auto border-l border-lc-border p-3">{vm.members.map(pubkey => <ConcordMember key={pubkey} community={community} pubkey={pubkey} />)}</aside>}
      </div>
    </section>}
    {vm.settings && <Modal onClose={vm.closeSettings} surface="card" panelClassName="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark">
      <ModalHeader title={t('chat.concord.settings')} onClose={vm.closeSettings} />
      <div className="space-y-6 overflow-y-auto p-5">
        {vm.canInvite && <Button variant="outline" data-testid="concord-create-invite" onClick={vm.createInvite}>{t('chat.concord.invite')}</Button>}
        {vm.invite && <div className="flex items-end gap-2"><Input readOnly label={t('chat.concord.invite')} value={vm.invite} data-testid="concord-invite-link" /><CopyButton size="md" text={vm.invite} label={t('shell.desktop.invite.copy')} copiedLabel={t('common.copied')} /></div>}
        <FormError>{vm.error}</FormError>
        {vm.canEditBranding && <ConcordBrandingForm community={community} branding={vm.branding} onSaved={vm.closeSettings} />}
        {vm.canManageChannels && <ConcordChannelForm community={community} />}
        {vm.canManageRoles && <ConcordRoleForm community={community} />}
      </div>
    </Modal>}
  </ChannelProtocolContext.Provider>;
}
