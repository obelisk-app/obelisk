'use client';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useTranslations } from 'next-intl';
import { useConcordMobileRoom } from '@/hooks/chat/concord/useConcordMobileRoom';
import { ChannelProtocolContext } from '@/contexts/chat/channel-protocol';
import { ChannelHeaderBar } from '../mobile/screens/channel/ChannelHeaderBar';
import { ChannelTimeline } from '../mobile/screens/channel/ChannelTimeline';
import { ChannelComposer } from '../mobile/screens/channel/ChannelComposer';
import { MobileServerBanner } from '../mobile/rail/MobileServerBanner';
import { MessageActionsSheet } from '../mobile/sheets/message/MessageActionsSheet';
import { AddRelaySheet } from '../mobile/sheets/relay/AddRelaySheet';
import { GroupNode } from '../panes/sidebar/GroupNode';
import Heading from '@/components/ui/layout/Heading';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import ConcordSearch from './ConcordSearch';
import ConcordSettings from './ConcordSettings';
import ConcordMember from './ConcordMember';

export default function ConcordMobileRoom({ community }: { community: ConcordCommunity }) {
  const t = useTranslations();
  const { scroller, ...vm } = useConcordMobileRoom(community);
  return <ChannelProtocolContext.Provider value={vm.protocol}>
    <div className="screens-host">
      <div className="screen-anim">
      {vm.channelsOpen ? <div className="screen active" data-screen="server" data-testid="concord-channels">
        <div className="server-mobile-layout"><section className="server-channel-pane">
        <MobileServerBanner privateCommunity concordPubkey={community.pubkey} communityRelays={vm.communityRelays} onSearch={vm.openSearch} label={vm.branding.name} relays={vm.relays} relayUrl={null} iconUrl={vm.branding.icon} bannerUrl={vm.branding.banner}
          onSelectRelay={vm.selectRelay} onAddRelay={vm.openAdd} onCreateChannel={vm.canManageChannels ? vm.openChannelSettings : undefined} onOpenMenu={vm.openSettings} />
        <div className="channel-list native-scroll-y">
          {vm.categories.map(category => <div key={category.name}>
            {category.name && <Heading as="h3" variant="panel" className="px-4 pt-4 pb-1">{category.name}</Heading>}
            {category.groups.map(group => <GroupNode key={group.id} group={group} depth={0} childrenByParent={{}} groupsById={{}} view={vm.group ? { kind: 'group', groupId: vm.group.id } : { kind: 'empty' }} onSelect={vm.pickChannel} />)}
          </div>)}
        </div>
        </section></div>
      </div> : <div className="screen active" data-screen="channel" data-testid="concord-room">
        <ChannelHeaderBar onSearch={vm.openSearch} header={vm.header} back={vm.showChannels} isChannelAdmin={vm.canManageChannels} onOpenSettings={vm.editChannel} openMembers={vm.toggleMembers} />
        <div className="messages-wrap relative flex min-h-0 flex-1 flex-col">
          <div className="messages native-scroll-y" ref={scroller} data-testid="concord-messages">
            <ChannelTimeline items={vm.items} messagesStatus="empty-confirmed" messagesById={vm.messagesById} reactions={vm.reactions} myPubkey={vm.myPubkey} isAdmin={false} groupId={vm.group?.id ?? ''} onLongPress={vm.openActions} onAvatar={vm.openProfile} />
          </div>
        </div>
        {vm.group && !vm.state.dissolved && <ChannelComposer key={vm.group.id} groupId={vm.group.id} group={vm.group} messages={vm.messages} replyingTo={vm.replyingTo} setReplyingTo={vm.setReplyingTo} onOpenNewGame={vm.openSettings} />}
      </div>}
      </div>
    {vm.searching && <ConcordSearch groups={vm.groups} messages={vm.messages} onClose={vm.closeSearch} onSelect={vm.pickChannel} />}
    {vm.settings && <ConcordSettings community={community} vm={vm} mobile />}
    {vm.adding && <AddRelaySheet close={vm.closeAdd} />}
    {vm.showMembers && <Sheet screen="members" label={t('mobile.members.members')} onClose={vm.toggleMembers}>
      <SheetHeader title={t('mobile.members.members')} onBack={vm.toggleMembers} />
      {vm.members.map(pubkey => <ConcordMember key={pubkey} community={community} pubkey={pubkey} />)}
    </Sheet>}
    {vm.actionMessage && <MessageActionsSheet msg={vm.actionMessage} close={vm.closeActions} onReply={vm.reply} />}
    </div>
  </ChannelProtocolContext.Provider>;
}
