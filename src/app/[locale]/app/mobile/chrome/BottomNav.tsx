'use client';

import Button from '@/components/ui/buttons/Button';
import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import HintDot from '@/components/hints/HintDot';
import { type ScreenName, type NavState } from '@/utils/shell/mobile/url-state';
import { activeTabFor, badgeLabel } from '@/utils/shell/mobile/bottom-nav';
import { NAV_HINT_ANCHOR, NAV_HINT_ID } from '@/constants/shell/mobile';
import { BellIcon, GlobeIcon, GridIcon, SendIcon, UserIcon } from '@/assets/icons';

interface NavTab { id: ScreenName; icon: ReactNode; label: string; badge?: number }

const NAV_ICONS: Record<'servers' | 'feed' | 'dms' | 'inbox' | 'you', ReactNode> = {
  servers: (
    <GridIcon size={null} />
  ),
  feed: (
    <GlobeIcon size={null} />
  ),
  dms: (
    <SendIcon size={null} />
  ),
  inbox: (
    <BellIcon size={null} strokeWidth={1.5} />
  ),
  you: (
    <UserIcon size={null} />
  ),
};

export function BottomNav({
  nav,
  onTabPress,
  dmBadge,
  inboxBadge,
}: {
  nav: NavState;
  onTabPress: (target: ScreenName) => void;
  dmBadge?: number;
  inboxBadge?: number;
}) {
  const t = useTranslations();
  const tabs: NavTab[] = [
    { id: 'server', icon: NAV_ICONS.servers, label: t('mobile.nav.servers') },
    { id: 'feed', icon: NAV_ICONS.feed, label: t('social.feed') },
    { id: 'dms-list', icon: NAV_ICONS.dms, label: t('mobile.nav.dms'), badge: dmBadge },
    { id: 'inbox', icon: NAV_ICONS.inbox, label: t('shell.inbox.title'), badge: inboxBadge },
    { id: 'settings-profile', icon: NAV_ICONS.you, label: t('settings.you') },
  ];
  const activeTab = activeTabFor(nav);
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <Button
          variant="bare"
          key={t.id}
          className={`nav-item ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => onTabPress(t.id)}
          aria-label={t.label}
          // Anchors the first-run hint for that screen, and carries its dot
          // until the screen has been visited or the hint dismissed.
          data-tour={NAV_HINT_ANCHOR[t.id]}
        >
          {t.icon}
          <span>{t.label}</span>
          {NAV_HINT_ID[t.id] && <HintDot hintId={NAV_HINT_ID[t.id] as string} />}
          {badgeLabel(t.badge) && <span className="nav-badge">{badgeLabel(t.badge)}</span>}
        </Button>
      ))}
    </nav>
  );
}
