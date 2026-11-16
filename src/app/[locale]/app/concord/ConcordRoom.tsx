'use client';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordRoom } from '@/hooks/chat/concord/useConcordRoom';
import { ChannelProtocolContext } from '@/contexts/chat/channel-protocol';
import { ChannelHeader } from '@/app/[locale]/app/panes/channel/ChannelHeader';
import { ChannelMessageList } from '@/app/[locale]/app/panes/channel/ChannelMessageList';
import { ChatComposer } from '@/app/[locale]/app/panes/channel/ChatComposer';
import { SidebarHeader } from '@/app/[locale]/app/panes/sidebar/SidebarHeader';
import { CreateGroupSection } from '@/app/[locale]/app/panes/sidebar/CreateGroupSection';
import { GroupNode } from '@/app/[locale]/app/panes/sidebar/GroupNode';
import { CategorySection } from '../panes/sidebar/CategorySection';
import ForumView from '@/components/chat/forum/ForumView';
import ConcordSettings from './ConcordSettings';
import ConcordMember from './ConcordMember';

export default function ConcordRoom({ community, pane }: { community: ConcordCommunity; pane: 'sidebar' | 'chat' }) {
  const { scroller, ...vm } = useConcordRoom(community);
  return <ChannelProtocolContext.Provider value={vm.protocol}>
    {pane === 'sidebar' ? <aside className="flex h-full min-h-0 flex-col bg-lc-dark" data-testid="concord-channels">
      <SidebarHeader privateCommunity relay="" conn="" branding={vm.branding} brandingLoaded showTitleSkeleton={false} isRelayOperator={vm.canEditBranding || vm.canInvite} onOpenSettings={vm.openSettings} />
      {vm.canManageChannels && <CreateGroupSection count={vm.groups.length} onCreated={vm.selectChannel} />}
      <div className="flex-1 overflow-y-auto p-2">
        {vm.categories.map(category => <CategorySection key={category.id} name={category.name} collapsed={vm.collapsedCategories.has(category.id)} onToggle={() => vm.toggleCategory(category.id)} channelCount={category.groups.length}>
          {category.groups.map(group => <GroupNode key={group.id} group={group} depth={0} childrenByParent={vm.childrenByParent} groupsById={vm.groupsById} view={vm.group ? { kind: 'group', groupId: vm.group.id } : { kind: 'empty' }} onSelect={vm.selectGroup} />)}
        </CategorySection>)}
      </div>
    </aside> : <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-lc-dark" data-testid="concord-room">
      <ChannelHeader groupId={vm.group?.id ?? ''} group={vm.group} isAdmin={vm.canManageChannels && !vm.threadId} showMembers={vm.showMembers} onToggleMembers={vm.toggleMembers} onOpenSettings={vm.editChannel} />
      {vm.publication && vm.group ? <ForumView groupId={vm.group.id} onSelectThread={vm.selectGroup} /> : <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" data-testid="concord-messages">
            <ChannelMessageList groupId={vm.group?.id ?? ''} group={vm.group} messages={vm.messages} messagesById={vm.messagesById} reactions={vm.reactions} zapTotals={new Map()} isAdmin={false} onReply={vm.setReplyingTo} emptyStage="welcome" />
          </div>
          {vm.group && !vm.state.dissolved && <ChatComposer key={vm.group.id} groupId={vm.group.id} group={vm.group} messages={vm.messages} replyingTo={vm.replyingTo} setReplyingTo={vm.setReplyingTo} onOpenNewGame={vm.openSettings} />}
        </div>
        {vm.showMembers && <aside className="w-60 shrink-0 overflow-y-auto border-l border-lc-border p-3">{vm.members.map(pubkey => <ConcordMember key={pubkey} community={community} pubkey={pubkey} />)}</aside>}
      </div>}
    </section>}
    {vm.settings && <ConcordSettings community={community} vm={vm} />}
  </ChannelProtocolContext.Provider>;
}
