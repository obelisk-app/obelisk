'use client';

/**
 * The screen the phone shell shows for `nav.screen`: a sub-screen over the
 * carousel, or the base screen kept mounted under the message sheet. A
 * sheet over a base that cannot mount renders nothing (`hasScreenBody` in
 * `src/utils/shell/mobile/carousel-slots.ts` says so before it is mounted).
 */
import FeedScreen from '@/components/social/FeedScreen';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { historyBack } from '@/services/shell/mobile/history';
import { ChannelScreen } from '../screens/channel/ChannelScreen';
import { ComposeDmScreen } from '../screens/dm/ComposeDmScreen';
import { DmThreadScreen } from '../screens/dm/DmThreadScreen';
import { DmsListScreen } from '../screens/dm/DmsListScreen';
import { MobileDmOptInScreen } from '../screens/dm/MobileDmOptInScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { ForumScreen } from '../screens/forum/ForumScreen';
import { InboxScreen } from '../screens/inbox/InboxScreen';
import { MemberListScreen } from '../screens/channel/MemberListScreen';
import NostrProfile from '@/components/chat/profile/NostrProfile';
import { SearchScreen } from '../screens/search/SearchScreen';
import { ServerScreen } from '../screens/server/ServerScreen';
import { lazy, Suspense } from 'react';
import Skeleton from '@/components/ui/animations/Skeleton';
import { SettingsProfileScreen } from '../screens/settings/SettingsProfileScreen';
import { EmptyScreen } from '../screens/status/EmptyScreen';
import { VoiceRoomScreen } from '../screens/voice/VoiceRoomScreen';

const SettingsPrefsScreen = lazy(() => import('../screens/settings/SettingsPrefsScreen').then((module) => ({ default: module.SettingsPrefsScreen })));

export function MobileScreenBody({ nav, p }: { nav: NavState; p: MobileScreenProps }) {
  switch (nav.screen) {
    case 'server':
      return <ServerScreen go={p.go} selectGroup={p.selectGroup} />;
    case 'feed':
      return <FeedScreen mobile onOpenProfile={p.exploreProfile} />;
    case 'channel':
      return nav.groupId ? (
        <ChannelScreen
          key={nav.groupId}
          groupId={nav.groupId}
          go={p.go}
          back={p.backFromChannel}
          openMsgActions={p.openMsgActions}
          openZap={p.openZap}
          openProfile={p.openProfile}
          openMembers={p.openMembers}
        />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noChannelSelected')} />;
    case 'voice-room':
      return nav.groupId ? (
        <VoiceRoomScreen
          groupId={nav.groupId}
          back={() => p.go('server', 'back')}
          openChat={p.openVoiceChat}
        />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noVoiceChannel')} />;
    case 'dms-list':
      return p.dmOptInEnabled
        ? <DmsListScreen go={p.go} selectPeer={p.selectPeer} myFollows={p.myFollows} />
        : <MobileDmOptInScreen onSecondary={() => p.go('server')} />;
    case 'dm-thread':
      return !p.dmOptInEnabled ? (
        <MobileDmOptInScreen secondaryLabel={p.t('common.back')} onSecondary={() => p.go('dms-list', 'back')} />
      ) : nav.dmPeer ? (
        <DmThreadScreen peer={nav.dmPeer} back={() => p.go('dms-list', 'back')} openProfile={p.openProfile} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noConversation')} />;
    case 'inbox':
      return <InboxScreen go={p.go} selectGroup={p.selectGroup} selectPeer={p.selectPeer} />;
    case 'profile-view':
      return nav.profilePubkey ? (
        <NostrProfile mobile pubkey={nav.profilePubkey} onClose={p.backFromProfile} onMessage={p.selectPeer} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noProfileSelected')} />;
    case 'member-list':
      return nav.groupId ? (
        <MemberListScreen groupId={nav.groupId} back={historyBack} openProfile={p.openProfile} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noChannel')} />;
    case 'compose-dm':
      return p.dmOptInEnabled
        ? <ComposeDmScreen back={() => p.go('dms-list', 'back')} selectPeer={p.selectPeer} />
        : <MobileDmOptInScreen secondaryLabel={p.t('common.back')} onSecondary={() => p.go('dms-list', 'back')} />;
    case 'search':
      return <SearchScreen back={() => p.go('server', 'back')} selectGroup={p.selectGroup} />;
    case 'forum':
      return nav.groupId ? (
        <ForumScreen groupId={nav.groupId} back={() => p.go('server', 'back')} selectChild={(childId) => p.selectGroup(childId, 'text')} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noForum')} />;
    case 'settings-profile':
      return <SettingsProfileScreen go={p.go} />;
    case 'settings-prefs':
      return (
        <Suspense fallback={<Skeleton className="screen active" data-testid="mobile-settings-loading" />}>
          <SettingsPrefsScreen go={p.go} />
        </Suspense>
      );
    case 'profile-edit':
      return <EditProfileScreen go={p.go} />;
    case 'msg-actions':
      // The sheet floats over the underlying screen (typically `channel`). Render
      // that base screen as the body here so it stays mounted in the same
      // sub-overlay slot - otherwise opening the actions sheet remounts
      // ChannelScreen and wipes local state like `replyingTo`.
      if ((nav.baseScreen === 'channel' || !nav.baseScreen) && nav.groupId) {
        return (
          <ChannelScreen
            key={nav.groupId}
            groupId={nav.groupId}
            go={p.go}
            back={p.backFromChannel}
            openMsgActions={p.openMsgActions}
            openZap={p.openZap}
            openProfile={p.openProfile}
            openMembers={p.openMembers}
          />
        );
      }
      if (nav.baseScreen === 'dm-thread' && nav.dmPeer) {
        return p.dmOptInEnabled
          ? <DmThreadScreen peer={nav.dmPeer} back={() => p.go('dms-list', 'back')} openProfile={p.openProfile} />
          : <MobileDmOptInScreen secondaryLabel={p.t('common.back')} onSecondary={() => p.go('dms-list', 'back')} />;
      }
      return null;
    default:
      return <EmptyScreen go={p.go} title={p.t('mobile.empty.unknownScreen')} />;
  }
}
