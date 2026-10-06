'use client';

import { type ReactNode } from 'react';
import { useTranslation } from '@/i18n/context';
import HintDot from '@/components/hints/HintDot';
import type { SurfaceId } from '@/utils/hints/registry';
import { type ScreenName, type NavState } from '@/utils/shell/mobile/url-state';
import { NAV_ORDER, resolveParent } from '@/utils/shell/mobile/swipe-nav';

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

/**
 * Which hint each bottom-nav tab introduces.
 *
 * The tab is the only control that exists before you have been to the
 * screen, so it is where the dot goes: the app says "there is something
 * over there" before it explains what.
 */
const NAV_HINT_ANCHOR: Partial<Record<ScreenName, string>> = {
  feed: 'nav-feed',
  'dms-list': 'dm-list',
  inbox: 'inbox-tabs',
  'settings-profile': 'profile-button',
};

const NAV_HINT_ID: Partial<Record<ScreenName, string>> = {
  feed: 'feed-source',
  'dms-list': 'dms',
  inbox: 'inbox',
  'settings-profile': 'identity',
};

/**
 * Screens that have something to explain. Anything else (a sheet, an
 * editor, a sub-screen) maps to nothing rather than borrowing its parent's
 * hint, which would point at a control the reader cannot see.
 */
const HINT_SURFACES = new Set<string>([
  'server', 'channel', 'feed', 'dms-list', 'inbox', 'settings-profile', 'voice-room',
]);

export function hintSurfaceFor(screen: ScreenName): SurfaceId | null {
  if (!HINT_SURFACES.has(screen)) return null;
  return (screen === 'voice-room' ? 'voice' : screen) as SurfaceId;
}

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
  const { t } = useTranslation();
  const tabs: NavTab[] = [
    { id: 'server', icon: NAV_ICONS.servers, label: t('mobile.nav.servers') },
    { id: 'feed', icon: NAV_ICONS.feed, label: t('social.feed') },
    { id: 'dms-list', icon: NAV_ICONS.dms, label: 'DMs', badge: dmBadge },
    { id: 'inbox', icon: NAV_ICONS.inbox, label: t('inbox.title'), badge: inboxBadge },
    { id: 'settings-profile', icon: NAV_ICONS.you, label: t('settings.you') },
  ];
  // Active tab = the top-level tab the current nav resolves to. For sub-
  // screens with dynamic parents (profile-view from inbox, member-list from
  // channel, ...) this respects where the user actually came from rather
  // than the hardcoded static map. See docs/mobile-navigation.md §3.
  const activeTab = NAV_ORDER.includes(nav.screen) ? nav.screen : resolveParent(nav);
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
          {t.badge !== undefined && t.badge > 0 && (
            <span className="nav-badge">{t.badge > 99 ? '99+' : t.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

export function shouldHideMobileBottomNav(screen: ScreenName, kbInset: number): boolean {
  return (
    screen === 'profile-view' ||
    screen === 'search' ||
    screen === 'compose-dm' ||
    screen === 'profile-edit' ||
    kbInset > 0
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 01 - login
