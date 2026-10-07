'use client';

import FeedScreen from '@/components/social/FeedScreen';
import type { MobileScreenProps } from '@/hooks/shell/mobile/nav/usePhoneShell';
import type { ScreenName } from '@/utils/shell/mobile/url-state';
import { DmsListScreen } from '../screens/dm/DmsListScreen';
import { MobileDmOptInScreen } from '../screens/dm/MobileDmOptInScreen';
import { InboxScreen } from '../screens/inbox/InboxScreen';
import { ServerScreen } from '../screens/server/ServerScreen';
import { SettingsProfileScreen } from '../screens/settings/SettingsProfileScreen';

/**
 * One of the persistent top-level tabs the drag carousel keeps mounted. A
 * sub-screen has no slot of its own (it falls back to its NAV_ORDER parent),
 * so it renders nothing here.
 */
export function TopLevelScreen({ screen, p }: { screen: ScreenName; p: MobileScreenProps }) {
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
