'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import HintDot from '@/components/hints/HintDot';
import { type ScreenName, type NavState } from '@/utils/shell/mobile/url-state';
import { activeTabFor, badgeLabel, NAV_HINT_ANCHOR, NAV_HINT_ID } from '@/utils/shell/mobile/bottom-nav';

interface NavTab { id: ScreenName; icon: ReactNode; label: string; badge?: number }

const NAV_ICONS: Record<'servers' | 'feed' | 'dms' | 'inbox' | 'you', ReactNode> = {
  servers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
  ),
  feed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></svg>
  ),
  dms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" /></svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
  ),
  you: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
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
        <button
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
        </button>
      ))}
    </nav>
  );
}
