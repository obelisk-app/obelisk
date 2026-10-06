'use client';

/**
 * The phone shell's screen table: which component each `nav.screen` mounts,
 * and the four persistent top-level tabs the drag carousel keeps mounted.
 * Plain functions, not components, so a sheet over an unmountable base still
 * yields `null` and the shell renders no overlay slot for it.
 */
import type { ReactNode } from 'react';
import type { JsGroup } from '@/services/nostr-bridge';
import FeedScreen from '@/components/social/FeedScreen';
import type { NavState, ScreenName } from '@/utils/shell/mobile/url-state';
import { ChannelScreen } from './screens/ChannelScreen';
import { ComposeDmScreen } from './screens/ComposeDmScreen';
import { DmThreadScreen } from './screens/DmThreadScreen';
import { DmsListScreen, MobileDmOptInScreen } from './screens/DmsListScreen';
import { EditProfileScreen } from './screens/EditProfileScreen';
import { ForumScreen } from './screens/ForumScreen';
import { InboxScreen } from './screens/InboxScreen';
import { MemberListScreen } from './screens/MemberListScreen';
import { ProfileViewScreen } from './screens/ProfileViewScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ServerScreen } from './screens/ServerScreen';
import { SettingsPrefsScreen } from './screens/SettingsPrefsScreen';
import { SettingsProfileScreen } from './screens/SettingsProfileScreen';
import { EmptyScreen } from './screens/StatusScreens';
import { VoiceRoomScreen } from './screens/VoiceRoomScreen';
import type { Translate } from '@/i18n/keys';

export interface MobileMessageContext {
  id: string;
  pubkey: string;
  content: string;
  groupId: string;
  canModerate: boolean;
  canDeleteOwn: boolean;
}

/** Everything a screen may ask the shell to do, plus the two bits of state the tabs read. */
export interface MobileScreenProps {
  readonly t: Translate;
  readonly dmOptInEnabled: boolean;
  readonly myFollows: ReadonlyArray<string>;
  readonly go: (screen: ScreenName, dir?: 'forward' | 'back') => void;
  readonly selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
  readonly selectPeer: (peer: string) => void;
  readonly exploreProfile: (pubkey: string) => void;
  readonly openProfile: (pubkey: string) => void;
  readonly openMembers: () => void;
  readonly openMsgActions: (msg: MobileMessageContext) => void;
  readonly openZap: (msg: { id: string; pubkey: string; content: string }) => void;
  readonly openVoiceChat: () => void;
  readonly backFromChannel: () => void;
  readonly backFromProfile: () => void;
}

// Renders one of the four top-level tab screens - used to mount the
// neighbor screens in the drag carousel slots without duplicating the
// big switch in the main body builder. Sub-screen neighbors fall back
// to their NAV_ORDER parent (which is always one of these four).
export function renderTopLevelScreen(screen: ScreenName, p: MobileScreenProps): ReactNode {
  switch (screen) {
    case 'server':
      return <ServerScreen go={p.go} selectGroup={p.selectGroup} />;
    case 'feed':
      return <FeedScreen mobile onOpenProfile={(pubkey) => p.exploreProfile(pubkey)} />;
    case 'dms-list':
      return p.dmOptInEnabled
        ? <DmsListScreen go={p.go} selectPeer={p.selectPeer} myFollows={p.myFollows} />
        : <MobileDmOptInScreen onSecondary={() => p.go('server')} />;
    case 'inbox':
      return <InboxScreen go={p.go} selectGroup={p.selectGroup} selectPeer={p.selectPeer} />;
    case 'settings-profile':
      return <SettingsProfileScreen go={p.go} />;
    default:
      return null;
  }
}

export function renderScreenBody(nav: NavState, p: MobileScreenProps): ReactNode {
  let body: ReactNode;
  switch (nav.screen) {
    case 'server':
      body = <ServerScreen go={p.go} selectGroup={p.selectGroup} />;
      break;
    case 'feed':
      body = <FeedScreen mobile onOpenProfile={(pubkey) => p.exploreProfile(pubkey)} />;
      break;
    case 'channel':
      body = nav.groupId ? (
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
      break;
    case 'voice-room':
      body = nav.groupId ? (
        <VoiceRoomScreen
          groupId={nav.groupId}
          back={() => p.go('server', 'back')}
          openChat={p.openVoiceChat}
        />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noVoiceChannel')} />;
      break;
    case 'dms-list':
      body = p.dmOptInEnabled
        ? <DmsListScreen go={p.go} selectPeer={p.selectPeer} myFollows={p.myFollows} />
        : <MobileDmOptInScreen onSecondary={() => p.go('server')} />;
      break;
    case 'dm-thread':
      body = !p.dmOptInEnabled ? (
        <MobileDmOptInScreen secondaryLabel={p.t('common.back')} onSecondary={() => p.go('dms-list', 'back')} />
      ) : nav.dmPeer ? (
        <DmThreadScreen peer={nav.dmPeer} back={() => p.go('dms-list', 'back')} openProfile={p.openProfile} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noConversation')} />;
      break;
    case 'inbox':
      body = <InboxScreen go={p.go} selectGroup={p.selectGroup} selectPeer={p.selectPeer} />;
      break;
    case 'profile-view':
      body = nav.profilePubkey ? (
        <ProfileViewScreen pubkey={nav.profilePubkey} back={p.backFromProfile} openDm={p.selectPeer} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noProfileSelected')} />;
      break;
    case 'member-list':
      body = nav.groupId ? (
        <MemberListScreen groupId={nav.groupId} back={() => { if (typeof window !== 'undefined') window.history.back(); }} openProfile={p.openProfile} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noChannel')} />;
      break;
    case 'compose-dm':
      body = p.dmOptInEnabled
        ? <ComposeDmScreen back={() => p.go('dms-list', 'back')} selectPeer={p.selectPeer} />
        : <MobileDmOptInScreen secondaryLabel={p.t('common.back')} onSecondary={() => p.go('dms-list', 'back')} />;
      break;
    case 'search':
      body = <SearchScreen back={() => p.go('server', 'back')} selectGroup={p.selectGroup} />;
      break;
    case 'forum':
      body = nav.groupId ? (
        <ForumScreen groupId={nav.groupId} back={() => p.go('server', 'back')} selectChild={(childId) => p.selectGroup(childId, 'text')} />
      ) : <EmptyScreen go={p.go} title={p.t('mobile.empty.noForum')} />;
      break;
    case 'settings-profile':
      body = <SettingsProfileScreen go={p.go} />;
      break;
    case 'settings-prefs':
      body = <SettingsPrefsScreen go={p.go} />;
      break;
    case 'profile-edit':
      body = <EditProfileScreen go={p.go} />;
      break;
    case 'msg-actions':
    case 'zap-modal':
      // Sheets float over the underlying screen (typically `channel`). Render
      // that base screen as the body here so it stays mounted in the same
      // sub-overlay slot - otherwise opening the actions sheet remounts
      // ChannelScreen and wipes local state like `replyingTo`.
      if ((nav.baseScreen === 'channel' || !nav.baseScreen) && nav.groupId) {
        body = (
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
      } else if (nav.baseScreen === 'dm-thread' && nav.dmPeer) {
        body = p.dmOptInEnabled
          ? <DmThreadScreen peer={nav.dmPeer} back={() => p.go('dms-list', 'back')} openProfile={p.openProfile} />
          : <MobileDmOptInScreen secondaryLabel={p.t('common.back')} onSecondary={() => p.go('dms-list', 'back')} />;
      } else {
        body = null;
      }
      break;
    default:
      body = <EmptyScreen go={p.go} title={p.t('mobile.empty.unknownScreen')} />;
  }
  return body;
}
